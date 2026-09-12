/**
 * scripts/ingest.ts — raw HTML mock test -> content/normalized/<external_id>.json
 *
 * This is a PURE, IDEMPOTENT TRANSFORM. It reports what the source says and
 * nothing else. It does not repair defects, fill gaps, guess missing
 * paragraphs, or reconcile contradictions: those belong in scripts/repair.ts
 * as an explicit, reviewable overlay. Re-running ingest on an unchanged raw
 * file must produce a byte-identical output file.
 *
 * Two markup dialects appear in content/raw/, from two generations of the same
 * generator. They differ only in class names, never in meaning, so they are
 * handled by a selector fallback rather than a second parser:
 *
 *     passage   .reading-passage        or  .passage-set (+ .passage-title)
 *     group     .question               or  .q-group
 *     heading   .question-prompt        or  .q-instruction
 *     label     <strong>A</strong>      or  <span class="para-label">A</span>
 *
 * Falling back is still a pure report of what the source says: nothing is
 * corrected, only located. A file that matches neither dialect is an error, not
 * a silent empty test.
 *
 * Parsing rules:
 *   - DOM via linkedom, never regex over markup.
 *   - Inline script literals via acorn, never eval.
 *   - Question type from instructions, then control shape. The file's own
 *     `questionTypes` map is a cross-check that raises warnings only.
 *
 * Usage:
 *   tsx scripts/ingest.ts <file.html|all> [--report-only] [--json]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { extractLiterals, normaliseAnswerKey, type KeyShape } from './lib/literals.ts';
import { inferQuestionType, crossCheckDeclaredType, isChoiceType, type ControlShape, type CrossCheck } from './lib/infer.ts';
import { clean, promptText, controlOrdinal, labelTextFor, declaredRange } from './lib/dom.ts';
import type {
  NormalizedTest, NormalizedSection, NormalizedGroup, NormalizedQuestion,
  Option, Paragraph, SectionKind, Evidence, TranscriptLine, TranscriptMarker,
} from '../src/types/content.ts';

export const RAW_DIR = resolve('content/raw');
export const OUT_DIR = resolve('content/normalized');

/** Everything ingest noticed but did not act on. */
export interface IngestReport {
  file: string;
  external_id: string;
  kind: SectionKind | 'unknown';
  sections: number;
  groups: number;
  questions: number;
  answers: number;
  key_shape: KeyShape;
  disagreements: CrossCheck[];
  paragraph_labels: string;
  evidence_markers: number;
  warnings: string[];
  errors: string[];
}

export function slugify(name: string): string {
  return name
    .replace(/\.html?$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** Roman numerals and single letters are the only shared-option labels used. */
const OPTION_LABEL = /^\s*\(?([A-H]|[ivx]{1,4})\)?\s*[.):]?\s+(.*)$/;

function parseSharedOptions(box: any): Option[] | null {
  if (!box) return null;
  const items = [...box.querySelectorAll('li, p')];
  const options: Option[] = [];
  for (const item of items) {
    if (item.querySelector('li, p')) continue;
    const text = clean(item.textContent);
    const match = OPTION_LABEL.exec(text);
    if (!match || !match[1] || !match[2]) continue;
    options.push({ label: match[1], text: match[2] });
  }
  return options.length >= 2 ? options : null;
}

/**
 * A summary-completion word bank, in either dialect.
 *
 * The newer files mark each choice as a draggable div carrying its own letter
 * in `data-value`, which is unambiguous. The older files print the bank as
 * plain paragraphs under a "List of words" heading, so we take only the
 * paragraphs that follow that heading and only those shaped like a labelled
 * option. Both are reading what the source says; neither invents a choice the
 * source does not contain.
 *
 * This matters because a summary question whose answer is a letter is
 * unanswerable without its bank: the student sees a text box and no way to know
 * what may go in it.
 */
const BANK_HEADING = /^list of (words|phrases|headings|people|items|options)\b/i;

function wordBankOptions(group: any): Option[] | null {
  // `.drag-item` specifically, not any [data-value]: the listening files put a
  // data-value on every radio, and scooping those up produced a "shared" list
  // of one question's options repeated once per question.
  const dragged = [...group.querySelectorAll('.drag-item[data-value]')]
    .map((el: any) => ({
      label: clean(el.getAttribute('data-value')),
      // The visible text repeats the letter; the label already carries it.
      text: clean(el.textContent).replace(/^\s*([A-H])(?:\s*[.):]\s*|\s+)(?=\S)/, ''),
    }))
    .filter((o: Option) => o.label !== '');
  if (dragged.length >= 2 && isDistinct(dragged)) return dragged;

  const blocks = [...group.querySelectorAll('p, li')];
  const headingIndex = blocks.findIndex((b: any) => BANK_HEADING.test(clean(b.textContent)));
  if (headingIndex === -1) return null;

  const options: Option[] = [];
  for (const block of blocks.slice(headingIndex + 1)) {
    const match = OPTION_LABEL.exec(clean(block.textContent));
    // The bank is a contiguous run. Stop at the first thing that is not one,
    // rather than scooping up whatever else follows on the page.
    if (!match || !match[1] || !match[2]) break;
    options.push({ label: match[1], text: match[2] });
  }
  return options.length >= 2 && isDistinct(options) ? options : null;
}

/** A shared list has one entry per label. Repeats mean we picked up the wrong
 *  elements, and a bank with two "A"s is worse than no bank at all. */
function isDistinct(options: Option[]): boolean {
  return new Set(options.map((o) => o.label)).size === options.length;
}

function sharedOptionBox(group: any): any {
  return group.querySelector('.example-box, .matching-options-box, .headings-box, .options-box');
}

/** Deepest ancestor holding every control for `ordinal` and no other question's. */
function exclusiveContainer(group: any, ordinal: number, controls: any[], owner: Map<any, number>): any {
  let node = controls[0]?.parentElement ?? null;
  let best: any = null;
  while (node && node !== group.parentElement) {
    const inside = [...node.querySelectorAll('input, select, textarea')];
    const others = inside.filter((el) => {
      const o = owner.get(el);
      return o !== undefined && o !== ordinal;
    });
    if (others.length > 0) break;
    if (inside.length >= controls.length) best = node;
    node = node.parentElement;
  }
  if (best) return best;
  // Shared block, e.g. a summary paragraph holding several blanks.
  return controls[0]?.closest?.('p, li, td, div') ?? controls[0]?.parentElement ?? null;
}

function controlShapeOf(controls: any[]): ControlShape {
  for (const el of controls) {
    const tag = (el.tagName ?? '').toLowerCase();
    if (tag === 'select') return 'select';
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
  }
  return controls.length > 0 ? 'text' : 'none';
}

function optionsFor(controls: any[], shape: ControlShape): Option[] | null {
  if (shape === 'radio' || shape === 'checkbox') {
    const options = controls.map((el) => ({
      label: el.getAttribute('value') ?? '',
      // Strip a leading option letter only when a real separator follows, so
      // that the bare value "FALSE" does not lose its F.
      text: labelTextFor(el).replace(/^\s*([A-H])(?:\s*[.):]\s*|\s+)(?=\S)/, ''),
    })).filter((o) => o.label !== '');
    return options.length > 0 ? options : null;
  }
  if (shape === 'select') {
    const select = controls.find((el) => (el.tagName ?? '').toLowerCase() === 'select');
    if (!select) return null;
    const options = [...select.querySelectorAll('option')]
      .map((o: any) => ({ label: o.getAttribute('value') ?? '', text: clean(o.textContent) }))
      .filter((o: Option) => o.label !== '');
    return options.length > 0 ? options : null;
  }
  return null;
}

function parseParagraphs(passage: any): Paragraph[] {
  const blocks = [...passage.querySelectorAll('p')].filter((p: any) => !p.querySelector('p'));
  const paragraphs: Paragraph[] = [];
  for (const block of blocks) {
    const text = clean(block.textContent);
    if (!text) continue;
    // A letter already printed as a leading marker, e.g. "<strong>A</strong> ..."
    // in the older dialect and "<span class="para-label">A</span>" in the newer.
    const lead = block.querySelector('.para-label, strong, b');
    const leadText = clean(lead?.textContent);
    const isLabel = /^[A-H]\.?$/.test(leadText) && text.startsWith(leadText);
    paragraphs.push({
      label: isLabel ? leadText.replace('.', '') : null,
      text: isLabel ? clean(text.slice(leadText.length)) : text,
    });
  }
  return paragraphs;
}

function parseTranscript(doc: any): { lines: TranscriptLine[]; markers: TranscriptMarker[]; byPart: Map<number, TranscriptMarker[]> } {
  const lines: TranscriptLine[] = [];
  const markers: TranscriptMarker[] = [];
  const byPart = new Map<number, TranscriptMarker[]>();
  const root = doc.querySelector('#transcription-data, #transcript-data, .transcription-data');
  if (!root) return { lines, markers, byPart };

  const parts = [...root.querySelectorAll('[data-part]')];
  const scopes: Array<[number, any]> = parts.length > 0
    ? parts.map((p: any) => [Number(p.getAttribute('data-part')) || 0, p])
    : [[0, root]];

  for (const [part, scope] of scopes) {
    for (const p of [...scope.querySelectorAll('p')]) {
      const speaker = clean(p.querySelector('strong, b')?.textContent).replace(/:$/, '') || null;
      lines.push({ speaker, text: clean(p.textContent) });
    }
    const list: TranscriptMarker[] = [];
    for (const hl of [...scope.querySelectorAll('[data-q]')]) {
      const ordinal = Number(hl.getAttribute('data-q'));
      if (!Number.isFinite(ordinal)) continue;
      const time = hl.getAttribute('data-time');
      const copy = hl.cloneNode(true);
      for (const mark of [...copy.querySelectorAll('.t-qmark')]) mark.remove();
      const marker: TranscriptMarker = {
        question_ordinal: ordinal,
        time_seconds: time !== null && time !== '' && Number.isFinite(Number(time)) ? Number(time) : null,
        text: clean(copy.textContent),
      };
      list.push(marker);
      markers.push(marker);
    }
    byPart.set(part, list);
  }
  return { lines, markers, byPart };
}

/** Single unambiguous occurrence of a text answer inside a passage. */
export function derivePassageEvidence(paragraphs: Paragraph[], answer: string): Evidence | null {
  const needle = answer.trim().toLowerCase();
  if (needle.length < 3) return null;
  const hits: Array<{ index: number; start: number }> = [];
  paragraphs.forEach((p, index) => {
    const hay = p.text.toLowerCase();
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      hits.push({ index, start: at });
      from = at + needle.length;
      if (hits.length > 1) return;
    }
  });
  if (hits.length !== 1) return null;
  const hit = hits[0]!;
  const paragraph = paragraphs[hit.index]!;
  return {
    kind: 'passage',
    paragraph_index: hit.index,
    start: hit.start,
    end: hit.start + answer.length,
    text: paragraph.text.slice(hit.start, hit.start + answer.length),
  };
}

function detectWatermark(html: string): string | null {
  const css = /content:\s*["'](@[^"']+)["']/.exec(html);
  if (css?.[1]) return css[1];
  const handle = /(?:t\.me\/|>)\s*(@[A-Za-z0-9_]{4,})\s*</.exec(html);
  return handle?.[1] ?? null;
}

export function ingestFile(path: string): { test: NormalizedTest | null; report: IngestReport } {
  const file = basename(path);
  const external_id = slugify(file);
  const warnings: string[] = [];
  const errors: string[] = [];
  const report: IngestReport = {
    file, external_id, kind: 'unknown', sections: 0, groups: 0, questions: 0,
    answers: 0, key_shape: 'unknown', disagreements: [], paragraph_labels: 'n/a',
    evidence_markers: 0, warnings, errors,
  };

  const html = readFileSync(path, 'utf8');
  const { document } = parseHTML(html);

  // ---- inline script literals -------------------------------------------
  const scriptSource = [...document.querySelectorAll('script')]
    .filter((s: any) => !s.getAttribute('src'))
    .map((s: any) => s.textContent ?? '')
    .join('\n;\n');

  let answerKey = normaliseAnswerKey(null);
  let declaredTypes: Record<string, string> = {};
  let audioUrl: string | null = null;
  let totalSeconds: number | null = null;

  try {
    const { values } = extractLiterals(scriptSource);
    const raw = values.get('correctAnswers');
    if (raw === undefined) errors.push('no `correctAnswers` literal found');
    else answerKey = normaliseAnswerKey(raw);

    const types = values.get('questionTypes');
    if (types && typeof types === 'object' && !Array.isArray(types)) {
      declaredTypes = Object.fromEntries(
        Object.entries(types).filter(([, v]) => typeof v === 'string') as Array<[string, string]>,
      );
    }
    const audio = values.get('audioSource');
    if (typeof audio === 'string' && audio.trim() !== '') audioUrl = audio.trim();
    const seconds = values.get('timeInSeconds') ?? values.get('totalTime');
    if (typeof seconds === 'number' && seconds > 0) totalSeconds = seconds;
  } catch (err) {
    errors.push(`script parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  report.key_shape = answerKey.shape;
  report.answers = answerKey.entries.size;

  // ---- sections ----------------------------------------------------------
  const readingSets = [...document.querySelectorAll('.question-set')];
  const listeningParts = [...document.querySelectorAll('.question-part')];
  const kind: SectionKind = listeningParts.length > 0 || document.querySelector('#transcription-data')
    ? 'listening'
    : 'reading';
  report.kind = kind;

  const containers = kind === 'listening' ? listeningParts : readingSets;
  if (containers.length === 0) errors.push('no section containers (.question-set / .question-part) found');

  // Either dialect, whichever this file speaks. Never both: mixing them would
  // pair a passage from one with a question set from the other.
  const passages = [...document.querySelectorAll('.reading-passage')];
  if (passages.length === 0) passages.push(...document.querySelectorAll('.passage-set'));
  const { lines, markers, byPart } = parseTranscript(document);
  report.evidence_markers = markers.length;

  const defaultTotal = kind === 'reading' ? 3600 : 2040;
  const perSection = Math.round((totalSeconds ?? defaultTotal) / Math.max(containers.length, 1));

  const sections: NormalizedSection[] = [];
  const seenOrdinals = new Set<number>();
  let groupCount = 0;
  const labelStatus: string[] = [];

  containers.forEach((container: any, sectionIndex: number) => {
    const ordinal = sectionIndex + 1;
    const sectionId = `${external_id}:s${ordinal}`;

    let stimulus: NormalizedSection['stimulus'];
    let paragraphs: Paragraph[] = [];
    if (kind === 'reading') {
      const passage = passages[sectionIndex];
      if (!passage) {
        errors.push(`section ${ordinal}: no matching .reading-passage / .passage-set`);
        paragraphs = [];
      } else {
        paragraphs = parseParagraphs(passage);
      }
      const labelled = paragraphs.filter((p) => p.label !== null).length;
      labelStatus.push(labelled === 0 ? `s${ordinal}:none/${paragraphs.length}` : `s${ordinal}:${labelled}/${paragraphs.length}`);
      stimulus = {
        type: 'passage',
        title: clean(
          passages[sectionIndex]?.querySelector('.passage-title, h1, h2, h3, h4')?.textContent,
        ),
        paragraphs,
      };
    } else {
      stimulus = {
        type: 'audio',
        audio_url: audioUrl,
        transcript: sectionIndex === 0 ? lines : [],
        markers: byPart.get(ordinal) ?? [],
      };
    }

    const groups: NormalizedGroup[] = [];
    const groupEls = [...container.querySelectorAll('.question')];
    if (groupEls.length === 0) groupEls.push(...container.querySelectorAll('.q-group'));
    if (groupEls.length === 0) errors.push(`section ${ordinal}: no .question / .q-group elements`);

    groupEls.forEach((group: any, groupIndex: number) => {
      groupCount++;
      const groupOrdinal = groupIndex + 1;
      const groupId = `${sectionId}:g${groupOrdinal}`;
      const promptEl = group.querySelector('.question-prompt, .q-instruction');
      const instructions = clean(promptEl?.textContent);
      const shared = parseSharedOptions(sharedOptionBox(group)) ?? wordBankOptions(group);

      // Map every control to the question ordinal that owns it.
      const owner = new Map<any, number>();
      const byOrdinal = new Map<number, any[]>();
      // A drop zone is a control: the newer dialect renders a summary blank as
      // a span you drag a word into rather than as an input you type in.
      for (const el of [...group.querySelectorAll('input, select, textarea, .drop-zone')]) {
        const ord = controlOrdinal(el);
        if (ord === null) continue;
        owner.set(el, ord);
        const list = byOrdinal.get(ord) ?? [];
        list.push(el);
        byOrdinal.set(ord, list);
      }

      const declared = declaredRange(promptEl ?? group);
      const attrRange = group.getAttribute('data-q-start') && group.getAttribute('data-q-end')
        ? [Number(group.getAttribute('data-q-start')), Number(group.getAttribute('data-q-end'))] as [number, number]
        : null;
      const found = [...byOrdinal.keys()].sort((a, b) => a - b);
      const expected = attrRange ?? declared;
      if (expected && found.length > 0) {
        const span = expected[1] - expected[0] + 1;
        if (span !== found.length) {
          warnings.push(`group ${groupOrdinal} in section ${ordinal}: declares ${expected[0]}-${expected[1]} (${span}) but ${found.length} controls found`);
        }
      }

      const questions: NormalizedQuestion[] = [];
      for (const ord of found) {
        if (seenOrdinals.has(ord)) {
          warnings.push(`question ${ord} appears in more than one group`);
          continue;
        }
        seenOrdinals.add(ord);
        const controls = byOrdinal.get(ord)!;
        const shape = controlShapeOf(controls);
        const inference = inferQuestionType(instructions, shape);
        const mismatch = crossCheckDeclaredType(ord, inference.type, declaredTypes[`q${ord}`], shape);
        if (mismatch) report.disagreements.push(mismatch);

        const container2 = exclusiveContainer(group, ord, controls, owner);
        const prompt = promptText(container2, [
          'label', '.multi-choice-option', '.tf-options',
          // Group chrome, in both dialects. It is instruction text, not the
          // question, and repeating it on every question would be noise.
          '.question-prompt', '.q-instruction', '.q-group-header', '.q-num',
        ]);
        const options = optionsFor(controls, shape) ?? (shared && !isChoiceType(inference.type) ? null : null);

        const accepted = answerKey.entries.get(ord) ?? [];
        if (accepted.length === 0) errors.push(`question ${ord}: no answer-key entry`);

        let evidence: Evidence | null = null;
        const marker = markers.find((m) => m.question_ordinal === ord);
        if (marker) {
          evidence = { kind: 'transcript', time_seconds: marker.time_seconds, text: marker.text };
        } else if (kind === 'reading' && accepted[0] && !isChoiceType(inference.type)) {
          evidence = derivePassageEvidence(paragraphs, accepted[0]);
        }

        questions.push({
          external_id: `${external_id}:q${ord}`,
          ordinal: ord,
          type: inference.type,
          prompt,
          options,
          // First entry is canonical; the rest are accepted spellings. The
          // array form of correct_answer is reserved for multi_select, where
          // every entry must be selected.
          correct_answer: inference.type === 'multi_select' ? accepted : (accepted[0] ?? ''),
          accepted_variants: inference.type === 'multi_select' ? [] : accepted.slice(1),
          evidence,
        });
      }

      if (questions.length > 0) {
        groups.push({
          external_id: groupId,
          ordinal: groupOrdinal,
          instructions,
          shared_options: shared,
          questions,
        });
      } else {
        warnings.push(`group ${groupOrdinal} in section ${ordinal}: no questions found`);
      }
    });

    sections.push({
      external_id: sectionId,
      kind,
      ordinal,
      duration_seconds: perSection,
      stimulus,
      groups,
    });
  });

  report.sections = sections.length;
  report.groups = groupCount;
  report.questions = sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.questions.length, 0), 0);
  report.paragraph_labels = kind === 'reading' ? labelStatus.join(' ') : 'n/a';

  // Answer-key entries with no matching question.
  for (const ord of answerKey.entries.keys()) {
    if (!seenOrdinals.has(ord)) errors.push(`answer key has question ${ord} with no question in the DOM`);
  }

  if (report.questions === 0) {
    return { test: null, report };
  }

  const test: NormalizedTest = {
    external_id,
    title: clean(document.querySelector('title')?.textContent) || external_id,
    is_full_mock: false,
    is_published: false,
    source_provenance: {
      origin: file,
      watermark: detectWatermark(html),
      shippable: false,
      repaired_by: null,
    },
    sections,
  };
  return { test, report };
}

function main(): void {
  const args = process.argv.slice(2);
  const reportOnly = args.includes('--report-only');
  const asJson = args.includes('--json');
  const targets = args.filter((a) => !a.startsWith('--'));

  const files = targets.length === 0 || targets[0] === 'all'
    ? readdirSync(RAW_DIR).filter((f) => f.toLowerCase().endsWith('.html')).sort().map((f) => join(RAW_DIR, f))
    : targets.map((t) => (t.includes('/') ? resolve(t) : join(RAW_DIR, t)));

  if (!reportOnly) mkdirSync(OUT_DIR, { recursive: true });

  const reports: IngestReport[] = [];
  for (const path of files) {
    let result;
    try {
      result = ingestFile(path);
    } catch (err) {
      reports.push({
        file: basename(path), external_id: slugify(basename(path)), kind: 'unknown',
        sections: 0, groups: 0, questions: 0, answers: 0, key_shape: 'unknown',
        disagreements: [], paragraph_labels: 'n/a', evidence_markers: 0, warnings: [],
        errors: [`ingest threw: ${err instanceof Error ? err.message : String(err)}`],
      });
      continue;
    }
    reports.push(result.report);
    if (!reportOnly && result.test) {
      const out = join(OUT_DIR, `${result.test.external_id}.json`);
      writeFileSync(out, `${JSON.stringify(result.test, null, 2)}\n`);
    }
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify(reports, null, 2)}\n`);
    return;
  }
  for (const r of reports) {
    const status = r.errors.length > 0 ? 'ERRORS' : r.warnings.length > 0 ? 'warnings' : 'ok';
    console.log(`${r.external_id}  [${r.kind}]  sections=${r.sections} groups=${r.groups} questions=${r.questions} answers=${r.answers} key=${r.key_shape} evidence=${r.evidence_markers}  ${status}`);
    for (const d of r.disagreements) console.log(`    type-disagreement q${d.ordinal}: ${d.message}`);
    for (const w of r.warnings) console.log(`    warning: ${w}`);
    for (const e of r.errors) console.log(`    error: ${e}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
