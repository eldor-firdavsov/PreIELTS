/**
 * scripts/validate.ts — check normalized content before it reaches Supabase.
 *
 * Runs over content/normalized/ and content/original/, preferring
 * content/normalized-repaired/<id>.json when an overlay has been applied.
 * Exits non-zero if any file has errors.
 *
 * content/original/ holds material authored for this product. It is the only
 * place a `shippable: true` provenance is believed, and the check is on the
 * load path rather than on the field, so hand-editing one word in an ingested
 * file cannot launder third-party content into shippable content.
 *
 * Errors block a seed. Warnings do not: a test that is not 40 questions long
 * is unusual but legitimate, and we want to see it rather than reject it.
 *
 * Usage:
 *   tsx scripts/validate.ts [external_id ...] [--json]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import type { NormalizedTest, QuestionType } from '../src/types/content.ts';

const NORMALIZED_DIR = resolve('content/normalized');
const REPAIRED_DIR = resolve('content/normalized-repaired');
const ORIGINAL_DIR = resolve('content/original');
const SCHEMA_PATH = resolve('scripts/schemas/content.schema.json');

/** Where a normalized file was loaded from. Provenance depends on it. */
export type ContentSource = 'normalized' | 'repaired' | 'original';

/** Types whose answer must name a declared option rather than free text. */
const CHOICE_TYPES = new Set<QuestionType>([
  'multiple_choice', 'multi_select', 'true_false_not_given', 'yes_no_not_given',
  'matching_headings', 'matching_information',
]);

const EXPECTED_QUESTIONS = 40;

/**
 * Where a test's content lives, in the order it takes precedence: a repair
 * overlay beats the ingested file, and an original file is looked for last
 * because ids never collide across the two.
 */
export function resolveContent(id: string): { path: string; source: ContentSource } | null {
  const repaired = join(REPAIRED_DIR, `${id}.json`);
  if (existsSync(repaired)) return { path: repaired, source: 'repaired' };
  const normalized = join(NORMALIZED_DIR, `${id}.json`);
  if (existsSync(normalized)) return { path: normalized, source: 'normalized' };
  const original = join(ORIGINAL_DIR, `${id}.json`);
  if (existsSync(original)) return { path: original, source: 'original' };
  return null;
}

/** Every id on disk, ingested and original alike. */
export function listContentIds(): string[] {
  const ids = new Set<string>();
  for (const dir of [NORMALIZED_DIR, ORIGINAL_DIR]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json')) ids.add(file.replace(/\.json$/, ''));
    }
  }
  return [...ids].sort();
}

export interface ValidationResult {
  external_id: string;
  source: ContentSource;
  kind: string;
  questions: number;
  errors: string[];
  warnings: string[];
}

function optionLabels(test: NormalizedTest, questionId: string): Set<string> | null {
  for (const section of test.sections) {
    for (const group of section.groups) {
      const question = group.questions.find((q) => q.external_id === questionId);
      if (!question) continue;
      const source = question.options ?? group.shared_options;
      if (!source) return null;
      return new Set(source.map((o) => o.label));
    }
  }
  return null;
}

export function validateTest(
  test: NormalizedTest,
  seenIds: Set<string>,
  source: ContentSource = 'normalized',
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- unique external_id, test and children -------------------------------
  const register = (id: string, what: string): void => {
    if (seenIds.has(id)) errors.push(`duplicate external_id ${id} (${what})`);
    seenIds.add(id);
  };
  register(test.external_id, 'test');

  const ordinals: number[] = [];

  for (const section of test.sections) {
    register(section.external_id, 'section');

    // --- audio present for listening ---------------------------------------
    if (section.kind === 'listening') {
      if (section.stimulus.type !== 'audio') {
        errors.push(`section ${section.ordinal}: listening section has a ${section.stimulus.type} stimulus`);
      } else if (!section.stimulus.audio_url) {
        errors.push(`section ${section.ordinal}: listening section has no audio_url`);
      } else if (/^https?:/i.test(section.stimulus.audio_url)) {
        // Hotlinking third-party audio is never allowed to reach the database.
        // Run scripts/upload-audio.ts, which uploads the file and records a
        // set_audio_path overlay operation.
        errors.push(`section ${section.ordinal}: audio_url is still an external URL (${section.stimulus.audio_url.slice(0, 60)}...), run scripts/upload-audio.ts`);
      }
    }
    if (section.kind === 'reading' && section.stimulus.type === 'passage' && section.stimulus.paragraphs.length === 0) {
      errors.push(`section ${section.ordinal}: reading section has no passage paragraphs`);
    }

    // --- every receptive section carries questions -------------------------
    // Reading and listening are marked against an answer key, so a section
    // with no groups is a section no one can answer.
    if (section.groups.length === 0) {
      errors.push(`section ${section.ordinal}: ${section.kind} section has no question groups`);
    }

    for (const group of section.groups) {
      register(group.external_id, 'group');

      for (const question of group.questions) {
        register(question.external_id, 'question');
        ordinals.push(question.ordinal);

        const answers = Array.isArray(question.correct_answer) ? question.correct_answer : [question.correct_answer];

        // --- every question has an answer-key entry -------------------------
        if (answers.length === 0 || answers.every((a) => a.trim() === '')) {
          errors.push(`q${question.ordinal}: no answer-key entry`);
          continue;
        }

        // --- accepted_variants are non-empty strings ------------------------
        question.accepted_variants.forEach((variant, i) => {
          if (typeof variant !== 'string' || variant.trim() === '') {
            errors.push(`q${question.ordinal}: accepted_variants[${i}] is empty`);
          }
        });

        // --- choice answers map to a declared option ------------------------
        if (CHOICE_TYPES.has(question.type)) {
          const labels = optionLabels(test, question.external_id);
          if (!labels || labels.size === 0) {
            errors.push(`q${question.ordinal}: type ${question.type} has no options and no group shared_options`);
          } else {
            for (const answer of answers) {
              if (!labels.has(answer)) {
                errors.push(`q${question.ordinal}: answer ${JSON.stringify(answer)} is not a declared option (${[...labels].join('/')})`);
              }
            }
          }
        }
      }
    }
  }

  // --- answer-key coverage in both directions --------------------------------
  // A question with no key is caught above. A key entry with no question shows
  // up here as a gap in the ordinal run; ingest also reports it at parse time.
  const receptive = test.sections.some((s) => s.kind === 'reading' || s.kind === 'listening');
  const unique = [...new Set(ordinals)].sort((a, b) => a - b);
  if (unique.length !== ordinals.length) {
    errors.push('duplicate question ordinals within the test');
  }
  const highest = unique.at(-1) ?? 0;
  const missing = [];
  for (let n = 1; n <= highest; n++) if (!unique.includes(n)) missing.push(n);
  if (missing.length > 0) {
    errors.push(`question ordinals missing from the test: ${missing.join(', ')}`);
  }

  // --- total count is a warning, never an error ------------------------------
  // The 40-question expectation only means anything for a paper that carries
  // numbered questions at all, so it is checked against those and nothing else.
  if (receptive && unique.length !== EXPECTED_QUESTIONS) {
    warnings.push(`${unique.length} questions, expected ${EXPECTED_QUESTIONS}`);
  }

  // --- provenance ------------------------------------------------------------
  // Shippable is decided by where the file was loaded from, not by what it
  // claims. Everything that came through ingest is third-party by definition.
  if (source !== 'original' && test.source_provenance.shippable !== false) {
    errors.push('source_provenance.shippable must be false for content/raw/ material');
  }
  if (test.is_published && !test.source_provenance.shippable) {
    warnings.push('is_published is true on unshippable content');
  }

  return { errors, warnings };
}

function main(): void {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const targets = args.filter((a) => !a.startsWith('--'));

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateSchema = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));

  const ids = targets.length > 0
    ? targets.map((t) => t.replace(/\.json$/, ''))
    : listContentIds();

  const seenIds = new Set<string>();
  const results: ValidationResult[] = [];

  for (const id of ids) {
    const found = resolveContent(id);
    if (!found) {
      results.push({ external_id: id, source: 'normalized', kind: '?', questions: 0, errors: [`no normalized file for ${id}`], warnings: [] });
      continue;
    }
    const { path, source } = found;
    const test = JSON.parse(readFileSync(path, 'utf8')) as NormalizedTest;

    const errors: string[] = [];
    const warnings: string[] = [];
    if (!validateSchema(test)) {
      for (const e of validateSchema.errors ?? []) {
        errors.push(`schema ${e.instancePath || '/'}: ${e.message}`);
      }
    }
    const semantic = validateTest(test, seenIds, source);
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);

    results.push({
      external_id: id,
      source,
      kind: test.sections[0]?.kind ?? '?',
      questions: test.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.questions.length, 0), 0),
      errors,
      warnings,
    });
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    const w = Math.max(12, ...results.map((r) => r.external_id.length));
    console.log(`${'file'.padEnd(w)}  ${'kind'.padEnd(9)}  ${'src'.padEnd(10)}  ${'qs'.padStart(3)}  ${'err'.padStart(4)}  ${'warn'.padStart(4)}`);
    console.log('-'.repeat(w + 42));
    for (const r of results) {
      console.log(`${r.external_id.padEnd(w)}  ${r.kind.padEnd(9)}  ${r.source.padEnd(10)}  ${String(r.questions).padStart(3)}  ${String(r.errors.length).padStart(4)}  ${String(r.warnings.length).padStart(4)}`);
    }
    for (const r of results) {
      if (r.errors.length === 0 && r.warnings.length === 0) continue;
      console.log(`\n${r.external_id}:`);
      for (const e of r.errors) console.log(`  ERROR   ${e}`);
      for (const x of r.warnings) console.log(`  warning ${x}`);
    }
  }

  const failed = results.filter((r) => r.errors.length > 0).length;
  if (failed > 0) {
    if (!asJson) console.log(`\n${failed} of ${results.length} files have errors`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
