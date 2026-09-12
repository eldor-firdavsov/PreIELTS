/**
 * The engine's content model — docs/ARCHITECTURE.md §3.
 *
 * The engine is content-agnostic: it knows question types, not passages or
 * audio. Adding a question type means one renderer plus one entry in the
 * renderer registry.
 *
 * One deliberate difference from §3. The architecture sketches `Question` with
 * a `correctAnswer` field annotated "never sent to the client mid-test". That
 * field is absent here. A type that carries the answer key invites a component
 * to read it, and one careless `select('*')` would then populate it for real.
 * The client reads the `questions_public` view, which has no such column, so
 * the type has no such field. Marking is done by `score_session()` in the
 * database, which is the only thing that ever sees an answer key.
 */

export type QuestionType =
  | 'multiple_choice'
  | 'multi_select'
  | 'true_false_not_given'
  | 'yes_no_not_given'
  | 'matching_headings'
  | 'matching_information'
  | 'sentence_completion'
  | 'summary_completion'
  | 'short_answer'
  | 'form_completion'
  | 'note_completion'
  | 'map_labelling';

export type SectionKind = 'reading' | 'listening';

/** A single answer. Arrays are only used by multi_select. */
export type AnswerValue = string | string[] | null;

export interface Option {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  groupId: string;
  /** Question number as printed, 1-40. Also the navigation key. */
  order: number;
  type: QuestionType;
  prompt: string;
  /** Present for choice and matching types, absent for typed answers. */
  options?: Option[];
}

export interface QuestionGroup {
  id: string;
  order: number;
  instructions: string;
  /** Shared A-G or i-vii list for matching types. */
  sharedOptions?: Option[];
  questions: Question[];
}

export interface Paragraph {
  label: string | null;
  text: string;
}

export interface PassageStimulus {
  type: 'passage';
  title: string;
  paragraphs: Paragraph[];
}

export interface AudioStimulus {
  type: 'audio';
  /** Storage path, never an external URL. */
  audioPath: string | null;
}


export type Stimulus =
  | PassageStimulus
  | AudioStimulus
  | { type: 'none' };

export interface SectionDefinition {
  id: string;
  kind: SectionKind;
  order: number;
  durationSeconds: number;
  stimulus: Stimulus;
  groups: QuestionGroup[];
}

export interface TestDefinition {
  id: string;
  externalId: string;
  title: string;
  isFullMock: boolean;
  sections: SectionDefinition[];
}

/** A stored answer plus the time the student spent on that question. */
export interface AnswerRecord {
  value: AnswerValue;
  timeSpentSeconds: number;
  /** Epoch millis of the last local change. Used to resolve flush races. */
  updatedAt: number;
}

/** Every question in a test, flattened in navigation order. */
export function flattenQuestions(section: SectionDefinition): Question[] {
  return section.groups.flatMap((group) => group.questions);
}

export function findGroupOf(section: SectionDefinition, questionId: string): QuestionGroup | undefined {
  return section.groups.find((group) => group.questions.some((q) => q.id === questionId));
}
