/**
 * scripts/audit.ts — measure every test against the Cambridge IELTS format.
 *
 * `validate.ts` asks whether a test is internally consistent. This asks a
 * different question: whether it looks like the exam a student is actually
 * sitting. A paper can be perfectly well-formed and still be poor practice —
 * thirty questions instead of forty, one question type for a whole passage, a
 * listening section with no audio.
 *
 * The specification below is the published Cambridge IELTS Academic format,
 * which is a description of structure and timing. No Cambridge text is
 * reproduced here or anywhere in this repository; a format is not content.
 *
 * Findings are graded. An `error` means the paper does not have the shape of an
 * IELTS test. A `warning` means it is unrepresentative but usable. Nothing here
 * blocks a seed: this is a report for whoever is choosing what to publish.
 *
 * Usage:
 *   tsx scripts/audit.ts [external_id ...] [--json]
 */
import { readFileSync } from 'node:fs';
import { listContentIds, resolveContent } from './validate.ts';
import type { NormalizedTest, SectionKind } from '../src/types/content.ts';

/** The published format, per skill. */
const SPEC = {
  reading: {
    sections: 3,
    questions: 40,
    totalSeconds: 3600,
    /** Cambridge passages run roughly 700-1000 words, rising in difficulty. */
    passageWords: [650, 1100] as [number, number],
    /** A passage drawn from one question type only is not how the exam reads. */
    minTypesPerSection: 2,
  },
  listening: {
    sections: 4,
    questions: 40,
    questionsPerSection: 10,
    /** Roughly 30 minutes of audio; the 10-minute transfer is not recorded. */
    totalSeconds: 1800,
    minTypesPerSection: 1,
  },
} as const;

export interface Finding {
  level: 'error' | 'warning';
  message: string;
}

export interface AuditResult {
  external_id: string;
  kind: SectionKind | '?';
  questions: number;
  conforms: boolean;
  findings: Finding[];
}

const err = (message: string): Finding => ({ level: 'error', message });
const warn = (message: string): Finding => ({ level: 'warning', message });

function words(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function auditTest(test: NormalizedTest): AuditResult {
  const findings: Finding[] = [];
  const kinds = [...new Set(test.sections.map((s) => s.kind))];
  const kind: SectionKind | '?' = kinds.length === 1 ? (kinds[0] as SectionKind) : '?';
  const questions = test.sections.reduce(
    (n, s) => n + s.groups.reduce((m, g) => m + g.questions.length, 0), 0);
  const totalSeconds = test.sections.reduce((n, s) => n + s.duration_seconds, 0);

  if (kinds.length > 1 && !test.is_full_mock) {
    findings.push(warn(`mixes ${kinds.join(' and ')} but is not marked a full mock`));
  }

  // ---------------------------------------------------------------- reading
  if (kind === 'reading') {
    const spec = SPEC.reading;
    if (test.sections.length !== spec.sections) {
      findings.push(err(`${test.sections.length} passages, the exam has ${spec.sections}`));
    }
    if (questions !== spec.questions) {
      findings.push(err(`${questions} questions, the exam has ${spec.questions}`));
    }
    if (totalSeconds !== spec.totalSeconds) {
      findings.push(warn(`${Math.round(totalSeconds / 60)} minutes total, the exam allows ${spec.totalSeconds / 60}`));
    }
    test.sections.forEach((section) => {
      if (section.stimulus.type !== 'passage') return;
      const count = section.stimulus.paragraphs.reduce((n, p) => n + words(p.text), 0);
      const [low, high] = spec.passageWords;
      if (count < low) findings.push(warn(`passage ${section.ordinal} is ${count} words, short of the usual ${low}`));
      if (count > high) findings.push(warn(`passage ${section.ordinal} is ${count} words, longer than the usual ${high}`));

      const types = new Set(section.groups.flatMap((g) => g.questions.map((q) => q.type)));
      if (types.size < spec.minTypesPerSection && types.size > 0) {
        findings.push(warn(`passage ${section.ordinal} uses only ${[...types][0]}; the exam mixes types within a passage`));
      }
    });
  }

  // -------------------------------------------------------------- listening
  if (kind === 'listening') {
    const spec = SPEC.listening;
    if (test.sections.length !== spec.sections) {
      findings.push(err(`${test.sections.length} sections, the exam has ${spec.sections}`));
    }
    if (questions !== spec.questions) {
      findings.push(err(`${questions} questions, the exam has ${spec.questions}`));
    }
    test.sections.forEach((section) => {
      const n = section.groups.reduce((m, g) => m + g.questions.length, 0);
      if (n !== spec.questionsPerSection) {
        findings.push(err(`section ${section.ordinal} has ${n} questions, every section has ${spec.questionsPerSection}`));
      }
      if (section.stimulus.type !== 'audio') return;
      if (!section.stimulus.audio_url) {
        findings.push(err(`section ${section.ordinal} has no recording, so it cannot be sat`));
      }
      const marked = new Set(section.stimulus.markers.map((m) => m.question_ordinal));
      const covered = section.groups
        .flatMap((g) => g.questions)
        .filter((q) => marked.has(q.ordinal)).length;
      if (covered < n) {
        findings.push(warn(`section ${section.ordinal}: ${covered} of ${n} questions have a replay timestamp`));
      }
    });
    /*
     * Per section, not per paper. Flattening the four together let a paper with
     * one transcribed section and three empty ones pass this check silently,
     * which is exactly the shape one paper on disk turned out to have.
     */
    const untranscribed = test.sections.filter(
      (s) => s.stimulus.type === 'audio' && s.stimulus.transcript.length === 0,
    );
    if (untranscribed.length === test.sections.length) {
      findings.push(warn('no transcript, so a student cannot read back what was said'));
    } else if (untranscribed.length > 0) {
      const ordinals = untranscribed.map((s) => String(s.ordinal));
      const which = ordinals.length === 1
        ? `section ${ordinals[0]} has`
        : `sections ${ordinals.slice(0, -1).join(', ')} and ${ordinals.at(-1)} have`;
      findings.push(warn(
        `${which} no transcript, so a student cannot read back what was said there`,
      ));
    }

    /*
     * Is the recording long enough for the paper it is set against?
     *
     * The markers are the only measure of a recording's length that lives in
     * this repository, and for a generated paper they are exact: each one is
     * the accumulated duration at the moment that question is answered. So the
     * last marker is where the tape effectively ends.
     *
     * This matters more here than it would elsewhere, because ListeningPlayer
     * anchors playback to the session clock rather than to the press of a
     * button. A tape far shorter than its paper does not merely feel rushed —
     * every question is over before a student who paused to read the
     * instructions has heard a word of it, and the player can only tell them
     * so. One paper on disk had forty questions inside nine minutes of audio
     * and a thirty-four minute clock, and nothing in either check noticed.
     */
    const lastMarker = test.sections.reduce(
      (latest, s) => (s.stimulus.type !== 'audio'
        ? latest
        : s.stimulus.markers.reduce((n, m) => Math.max(n, m.time_seconds ?? 0), latest)),
      0,
    );
    if (lastMarker > 0) {
      const minutes = (n: number): string => (n / 60).toFixed(1);
      if (lastMarker < spec.totalSeconds / 2) {
        findings.push(err(
          `the last question is heard at ${minutes(lastMarker)} minutes, against ${minutes(spec.totalSeconds)} minutes of recording in the exam; ` +
          'playback follows the test clock, so a student who starts late hears none of it',
        ));
      } else if (lastMarker < spec.totalSeconds * 0.75) {
        findings.push(warn(
          `the last question is heard at ${minutes(lastMarker)} minutes, against ${minutes(spec.totalSeconds)} minutes in the exam; the recording is short for the paper`,
        ));
      }
    }
  }

  // ------------------------------------------------------- answer key depth
  const answerable = test.sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
  const withVariants = answerable.filter(
    (q) => q.accepted_variants.length > 0 && typeof q.correct_answer === 'string').length;
  const typed = answerable.filter((q) => !q.options && typeof q.correct_answer === 'string').length;
  if (typed > 0 && withVariants === 0) {
    findings.push(warn(`${typed} typed answers and no accepted variants; a correct answer spelled differently will be marked wrong`));
  }

  return {
    external_id: test.external_id,
    kind,
    questions,
    conforms: findings.every((f) => f.level !== 'error'),
    findings,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const targets = args.filter((a) => !a.startsWith('--'));
  const ids = targets.length > 0 ? targets : listContentIds();

  const results: AuditResult[] = [];
  for (const id of ids) {
    const found = resolveContent(id);
    if (!found) {
      results.push({ external_id: id, kind: '?', questions: 0, conforms: false,
        findings: [err('no normalized file')] });
      continue;
    }
    results.push(auditTest(JSON.parse(readFileSync(found.path, 'utf8')) as NormalizedTest));
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  const w = Math.max(12, ...results.map((r) => r.external_id.length));
  console.log(`${'test'.padEnd(w)}  ${'skill'.padEnd(9)}  ${'qs'.padStart(3)}  ${'exam shape'.padEnd(10)}  notes`);
  console.log('-'.repeat(w + 40));
  for (const r of results) {
    const errors = r.findings.filter((f) => f.level === 'error').length;
    const warnings = r.findings.length - errors;
    console.log(
      `${r.external_id.padEnd(w)}  ${r.kind.padEnd(9)}  ${String(r.questions).padStart(3)}  ` +
      `${(r.conforms ? 'yes' : 'no').padEnd(10)}  ${errors} error, ${warnings} warning`,
    );
  }
  for (const r of results) {
    if (r.findings.length === 0) continue;
    console.log(`\n${r.external_id}:`);
    for (const f of r.findings) {
      console.log(`  ${f.level === 'error' ? 'ERROR  ' : 'warning'} ${f.message}`);
    }
  }
  const conforming = results.filter((r) => r.conforms).length;
  console.log(`\n${conforming} of ${results.length} tests have the shape of a Cambridge IELTS paper.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
