/**
 * scripts/repair.ts — overlay step between ingest and seed.
 *
 * ingest.ts is a pure transform and never corrects its source. Where a raw
 * file is defective, the correction lives in content/repairs/<external_id>.json
 * as an ordered list of typed operations, each carrying a reason. This script
 * applies that overlay and writes content/normalized-repaired/<external_id>.json.
 *
 *   content/normalized/          <- ingest output, NEVER mutated
 *   content/repairs/             <- hand-authored, reviewable overlays
 *   content/normalized-repaired/ <- what seed reads when an overlay exists
 *
 * Operations are applied in order and each sees the result of the previous, so
 * indices in later operations refer to the already-shifted arrays.
 *
 * An unknown operation, or one that does not apply cleanly, is an ERROR. This
 * script never skips an operation and never silently no-ops: a repair file
 * that has drifted from its source must fail loudly rather than half-apply.
 *
 * Usage:
 *   tsx scripts/repair.ts <external_id|all>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { derivePassageEvidence } from './ingest.ts';
import type { NormalizedTest, NormalizedSection, Paragraph } from '../src/types/content.ts';

export const IN_DIR = resolve('content/normalized');
export const REPAIR_DIR = resolve('content/repairs');
export const OUT_DIR = resolve('content/normalized-repaired');

/** Move one paragraph between passages. Indices are 0-based, sections 1-based. */
export interface MoveParagraphOp {
  op: 'move_paragraph';
  from_section: number;
  from_index: number;
  to_section: number;
  to_index: number;
  reason: string;
}

/** Assign A-H letters to a passage. `letters` must cover every paragraph. */
export interface SetParagraphLabelsOp {
  op: 'set_paragraph_labels';
  section: number;
  letters: string[];
  reason: string;
}

/** Override a single answer key entry, by question external_id. */
export interface SetAnswerOp {
  op: 'set_answer';
  question: string;
  value: string | string[];
  accepted_variants?: string[];
  reason: string;
}

/**
 * Point a listening test's audio at Supabase Storage. Written by
 * scripts/upload-audio.ts once the file has actually been uploaded, never by
 * hand, and never as a fallback when an upload failed.
 */
export interface SetAudioPathOp {
  op: 'set_audio_path';
  /** Bucket-qualified object path, e.g. `audio/listening-1.mp3`. */
  path: string;
  /** The third-party URL the bytes came from, kept for audit. */
  source_url: string;
  /** sha256 of the uploaded bytes, so a re-upload can be skipped. */
  sha256: string;
  reason: string;
}

export type RepairOp = MoveParagraphOp | SetParagraphLabelsOp | SetAnswerOp | SetAudioPathOp;

export interface RepairFile {
  external_id: string;
  description?: string;
  operations: RepairOp[];
}

class RepairError extends Error {}

function fail(index: number, op: { op?: string }, message: string): never {
  throw new RepairError(`operation ${index + 1} (${op.op ?? 'no op field'}): ${message}`);
}

function sectionByOrdinal(test: NormalizedTest, ordinal: number): NormalizedSection | undefined {
  return test.sections.find((s) => s.ordinal === ordinal);
}

function paragraphsOf(section: NormalizedSection): Paragraph[] {
  if (section.stimulus.type !== 'passage') {
    throw new RepairError(`section ${section.ordinal} has no passage to operate on`);
  }
  return section.stimulus.paragraphs;
}

function applyOperation(test: NormalizedTest, op: RepairOp, index: number): void {
  switch (op.op) {
    case 'move_paragraph': {
      const from = sectionByOrdinal(test, op.from_section);
      const to = sectionByOrdinal(test, op.to_section);
      if (!from) fail(index, op, `from_section ${op.from_section} does not exist`);
      if (!to) fail(index, op, `to_section ${op.to_section} does not exist`);
      const source = paragraphsOf(from);
      const target = paragraphsOf(to);
      if (!Number.isInteger(op.from_index) || op.from_index < 0 || op.from_index >= source.length) {
        fail(index, op, `from_index ${op.from_index} out of range, section ${op.from_section} has ${source.length} paragraphs`);
      }
      const [moved] = source.splice(op.from_index, 1);
      if (!moved) fail(index, op, 'nothing removed');
      if (!Number.isInteger(op.to_index) || op.to_index < 0 || op.to_index > target.length) {
        source.splice(op.from_index, 0, moved);
        fail(index, op, `to_index ${op.to_index} out of range, section ${op.to_section} accepts 0..${target.length}`);
      }
      target.splice(op.to_index, 0, moved);
      return;
    }
    case 'set_paragraph_labels': {
      const section = sectionByOrdinal(test, op.section);
      if (!section) fail(index, op, `section ${op.section} does not exist`);
      const paragraphs = paragraphsOf(section);
      if (!Array.isArray(op.letters)) fail(index, op, 'letters must be an array');
      if (op.letters.length !== paragraphs.length) {
        fail(index, op, `letters has ${op.letters.length} entries but section ${op.section} has ${paragraphs.length} paragraphs`);
      }
      const seen = new Set<string>();
      op.letters.forEach((letter, i) => {
        if (!/^[A-H]$/.test(letter)) fail(index, op, `letter ${JSON.stringify(letter)} is not A-H`);
        if (seen.has(letter)) fail(index, op, `letter ${letter} used twice`);
        seen.add(letter);
        paragraphs[i]!.label = letter;
      });
      return;
    }
    case 'set_audio_path': {
      if (typeof op.path !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+\.[a-z0-9]+$/.test(op.path)) {
        fail(index, op, `path ${JSON.stringify(op.path)} is not a bucket-qualified object path`);
      }
      if (/^https?:/i.test(op.path)) fail(index, op, 'path must be a storage path, not a URL');
      let applied = 0;
      for (const section of test.sections) {
        if (section.stimulus.type !== 'audio') continue;
        section.stimulus.audio_url = op.path;
        applied++;
      }
      if (applied === 0) fail(index, op, 'test has no audio stimulus to point at');
      return;
    }
    case 'set_answer': {
      for (const section of test.sections) {
        for (const group of section.groups) {
          const question = group.questions.find((q) => q.external_id === op.question);
          if (!question) continue;
          question.correct_answer = op.value;
          if (op.accepted_variants) question.accepted_variants = op.accepted_variants;
          return;
        }
      }
      fail(index, op, `question ${op.question} not found`);
      return;
    }
    default:
      fail(index, op as { op?: string }, `unknown operation type ${JSON.stringify((op as { op?: string }).op)}`);
  }
}

/**
 * Passage evidence is a character offset into a specific paragraph, so any
 * move invalidates it. Re-derive from the canonical answer rather than
 * carrying a stale index forward.
 */
function reDeriveEvidence(test: NormalizedTest): void {
  for (const section of test.sections) {
    if (section.stimulus.type !== 'passage') continue;
    const paragraphs = section.stimulus.paragraphs;
    for (const group of section.groups) {
      for (const question of group.questions) {
        if (question.evidence?.kind === 'transcript') continue;
        const answer = Array.isArray(question.correct_answer) ? question.correct_answer[0] : question.correct_answer;
        question.evidence = answer ? derivePassageEvidence(paragraphs, answer) : null;
      }
    }
  }
}

/**
 * Post-conditions checked after every overlay. These are the checks that make
 * a paragraph-lettering repair meaningful: a letter an answer refers to must
 * name a paragraph that exists.
 */
function verifyLetterMapping(test: NormalizedTest): string[] {
  const problems: string[] = [];
  for (const section of test.sections) {
    if (section.stimulus.type !== 'passage') continue;
    const labels = new Set(
      section.stimulus.paragraphs.map((p) => p.label).filter((l): l is string => l !== null),
    );
    if (labels.size === 0) continue;

    for (const group of section.groups) {
      for (const question of group.questions) {
        if (question.type === 'matching_information') {
          // The answer IS a paragraph letter.
          const answers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];
          for (const answer of answers) {
            if (!labels.has(answer)) {
              problems.push(`${question.external_id}: answer ${JSON.stringify(answer)} names no paragraph in section ${section.ordinal} (labels ${[...labels].join('')})`);
            }
          }
        }
        if (question.type === 'matching_headings') {
          // The PROMPT names a paragraph letter; the answer is a heading numeral.
          const named = /paragraph\s+([A-H])\b/i.exec(question.prompt);
          if (named?.[1] && !labels.has(named[1].toUpperCase())) {
            problems.push(`${question.external_id}: prompt names paragraph ${named[1]} which does not exist in section ${section.ordinal}`);
          }
        }
      }
    }
  }
  return problems;
}

export function applyRepair(test: NormalizedTest, repair: RepairFile, repairPath: string): { test: NormalizedTest; problems: string[] } {
  if (repair.external_id !== test.external_id) {
    throw new RepairError(`repair file targets ${repair.external_id} but was applied to ${test.external_id}`);
  }
  if (!Array.isArray(repair.operations) || repair.operations.length === 0) {
    throw new RepairError('repair file has no operations');
  }
  const next: NormalizedTest = JSON.parse(JSON.stringify(test));
  repair.operations.forEach((op, index) => {
    if (typeof (op as { reason?: unknown }).reason !== 'string' || (op as { reason: string }).reason.trim() === '') {
      fail(index, op, 'missing reason');
    }
    applyOperation(next, op, index);
  });
  reDeriveEvidence(next);
  next.source_provenance.repaired_by = relative(process.cwd(), repairPath);
  return { test: next, problems: verifyLetterMapping(next) };
}

function main(): void {
  const args = process.argv.slice(2);
  const target = args[0] ?? 'all';
  const ids = target === 'all'
    ? readdirSync(REPAIR_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
    : [target.replace(/\.json$/, '')];

  if (ids.length === 0) {
    console.log('no repair overlays in content/repairs/');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let failed = 0;
  for (const id of ids) {
    const repairPath = join(REPAIR_DIR, `${id}.json`);
    const inPath = join(IN_DIR, `${id}.json`);
    if (!existsSync(inPath)) {
      console.error(`${id}: ERROR no ingested file at ${relative(process.cwd(), inPath)}, run ingest first`);
      failed++;
      continue;
    }
    const test = JSON.parse(readFileSync(inPath, 'utf8')) as NormalizedTest;
    const repair = JSON.parse(readFileSync(repairPath, 'utf8')) as RepairFile;

    try {
      const { test: repaired, problems } = applyRepair(test, repair, repairPath);
      writeFileSync(join(OUT_DIR, `${id}.json`), `${JSON.stringify(repaired, null, 2)}\n`);
      console.log(`${id}: applied ${repair.operations.length} operations -> content/normalized-repaired/${id}.json`);
      for (const op of repair.operations) console.log(`    ${op.op}: ${op.reason}`);
      if (problems.length > 0) {
        failed++;
        console.error(`  letter-mapping verification FAILED:`);
        for (const p of problems) console.error(`    ${p}`);
      } else {
        console.log(`  letter-mapping verification passed`);
      }
    } catch (err) {
      failed++;
      console.error(`${id}: ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
