/**
 * Normalized IELTS test content.
 *
 * This mirrors the columns in supabase/migrations/0001_init.sql. One
 * NormalizedTest maps to one `tests` row plus its `sections`,
 * `question_groups` and `questions` children. Field names deliberately match
 * the SQL column names so `scripts/seed.ts` is a direct upsert with no
 * renaming layer in between.
 *
 * Nothing in this file is hand-authored content. Files under
 * content/normalized/ are produced only by scripts/ingest.ts.
 */

/** The 12-value `question_type` enum, minus the two productive-skill values. */
export const RECEPTIVE_QUESTION_TYPES = [
  'multiple_choice',
  'multi_select',
  'true_false_not_given',
  'yes_no_not_given',
  'matching_headings',
  'matching_information',
  'sentence_completion',
  'summary_completion',
  'short_answer',
  'form_completion',
  'note_completion',
  'map_labelling',
] as const;

export type ReceptiveQuestionType = (typeof RECEPTIVE_QUESTION_TYPES)[number];

/** Full `question_type` enum as declared in 0001_init.sql. */
export type QuestionType = ReceptiveQuestionType;

/** `section_kind` enum. */
export type SectionKind = 'reading' | 'listening';

/** One selectable choice. `label` is what the answer key stores. */
export interface Option {
  /** 'A', 'B', 'i', 'ii', 'TRUE' — the value the answer key compares against. */
  label: string;
  /** Human-readable body. Empty for bare-letter options such as TRUE/FALSE. */
  text: string;
}

/** A single passage paragraph. `label` is the A–H letter where one exists. */
export interface Paragraph {
  label: string | null;
  text: string;
}

export interface PassageStimulus {
  type: 'passage';
  title: string;
  paragraphs: Paragraph[];
}

/** One marked span in a listening transcript, keyed to a question number. */
export interface TranscriptMarker {
  question_ordinal: number;
  time_seconds: number | null;
  text: string;
}

export interface TranscriptLine {
  speaker: string | null;
  text: string;
}

export interface AudioStimulus {
  type: 'audio';
  /**
   * Currently an absolute third-party URL lifted from the source file. Must
   * become a Supabase Storage path before launch. See CLAUDE.md.
   */
  audio_url: string | null;
  transcript: TranscriptLine[];
  markers: TranscriptMarker[];
}


export type Stimulus =
  | PassageStimulus
  | AudioStimulus;

/**
 * Where the answer can be found. Offsets are into the concatenated paragraph
 * text of the owning section, so a renderer can highlight without re-parsing.
 */
export type Evidence =
  | {
      kind: 'passage';
      paragraph_index: number;
      /** Character offset within that paragraph's `text`. */
      start: number;
      end: number;
      text: string;
    }
  | {
      kind: 'transcript';
      time_seconds: number | null;
      text: string;
    };

export interface NormalizedQuestion {
  /** Stable and globally unique: `<test external_id>:q<ordinal>`. */
  external_id: string;
  /** Question number as printed in the test, 1-40. */
  ordinal: number;
  type: QuestionType;
  prompt: string;
  /** Per-question options. Null when the group carries shared_options. */
  options: Option[] | null;
  /** Canonical answer. `questions.correct_answer` jsonb. */
  correct_answer: string | string[];
  /** Alternative spellings and phrasings. `questions.accepted_variants`. */
  accepted_variants: string[];
  evidence: Evidence | null;
}

export interface NormalizedGroup {
  external_id: string;
  ordinal: number;
  instructions: string;
  /** Shared A–G / i–vii list for matching types. Null otherwise. */
  shared_options: Option[] | null;
  questions: NormalizedQuestion[];
}

export interface NormalizedSection {
  external_id: string;
  kind: SectionKind;
  ordinal: number;
  duration_seconds: number;
  stimulus: Stimulus;
  groups: NormalizedGroup[];
}

/**
 * Licensing metadata. Every file ingested from content/raw/ is third-party
 * material and carries `shippable: false`. Seed refuses to publish a test
 * whose provenance is not shippable.
 *
 * `true` is reserved for original material authored for this product, which
 * lives in content/original/ and is committed. validate.ts refuses a true on
 * anything loaded from content/normalized/, so an ingested file cannot claim
 * to be ours by hand-editing one word.
 */
export interface SourceProvenance {
  /** Original filename under content/raw/, or 'original' for our own material. */
  origin: string;
  /** Watermark or attribution found in the source, e.g. '@MINDLESS_WRITER'. */
  watermark: string | null;
  /** False for everything in content/raw/. Never hand-edit to true. */
  shippable: boolean;
  /** Set by repair.ts when an overlay has been applied. */
  repaired_by: string | null;
}

export interface NormalizedTest {
  external_id: string;
  title: string;
  is_full_mock: boolean;
  is_published: boolean;
  source_provenance: SourceProvenance;
  sections: NormalizedSection[];
}
