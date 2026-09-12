/**
 * Question-type inference.
 *
 * Order of authority, per the agreed mapping:
 *   1. group instruction text  (what the test actually asks)
 *   2. DOM control shape       (radio / select / text input)
 *   3. the file's own `questionTypes` map — CROSS-CHECK ONLY
 *
 * The `questionTypes` map only ever says 'text' or 'mcq', which describes the
 * input control and not the IELTS question type. It is never allowed to
 * override inference; a contradiction is reported as a warning.
 */
import type { QuestionType } from '../../src/types/content.ts';

/** The DOM control a question is answered with. */
export type ControlShape = 'radio' | 'checkbox' | 'select' | 'text' | 'none';

export interface InferenceResult {
  type: QuestionType;
  /** Which rule fired, for auditability. */
  basis: string;
  confident: boolean;
}

const RULES: Array<[RegExp, QuestionType, string]> = [
  [/\btrue\b[\s\S]{0,140}\bfalse\b[\s\S]{0,140}\bnot given\b/i, 'true_false_not_given', 'instructions: TRUE/FALSE/NOT GIVEN'],
  [/\byes\b[\s\S]{0,140}\bno\b[\s\S]{0,140}\bnot given\b/i, 'yes_no_not_given', 'instructions: YES/NO/NOT GIVEN'],
  [/list of headings|correct heading for each/i, 'matching_headings', 'instructions: headings list'],
  [/which paragraph contains|which section contains/i, 'matching_information', 'instructions: which paragraph contains'],
  [/label the (map|plan|diagram)/i, 'map_labelling', 'instructions: label the map'],
  [/complete the summary/i, 'summary_completion', 'instructions: complete the summary'],
  [/complete the notes?\b/i, 'note_completion', 'instructions: complete the notes'],
  [/complete the (form|table)s?\b/i, 'form_completion', 'instructions: complete the form/table'],
  [/complete the (sentence|flow-chart)s?\b/i, 'sentence_completion', 'instructions: complete the sentences'],
  [/match each|look at the following|next to questions|choose (two|three|four|five|six|seven)\s+correct answers?/i, 'matching_information', 'instructions: matching prompt'],
  [/choose (the )?(correct )?(letter|answer|option)/i, 'multiple_choice', 'instructions: choose the correct letter'],
  [/answer the questions below|no more than \w+ words? (and\/or a number )?from the (passage|text)/i, 'short_answer', 'instructions: short answer'],
];

const CHOICE_TYPES = new Set<QuestionType>([
  'multiple_choice',
  'multi_select',
  'true_false_not_given',
  'yes_no_not_given',
]);

/** Fallback used when no instruction rule matches: pick from the control. */
function fromControl(shape: ControlShape): InferenceResult {
  switch (shape) {
    case 'radio':
      return { type: 'multiple_choice', basis: 'control: radio', confident: false };
    case 'checkbox':
      return { type: 'multi_select', basis: 'control: checkbox', confident: false };
    case 'select':
      return { type: 'matching_information', basis: 'control: select', confident: false };
    default:
      return { type: 'sentence_completion', basis: 'control: text input', confident: false };
  }
}

export function inferQuestionType(instructions: string, shape: ControlShape): InferenceResult {
  const text = instructions.replace(/\s+/g, ' ');
  for (const [pattern, type, basis] of RULES) {
    if (!pattern.test(text)) continue;
    // "Choose TWO letters" inside an otherwise multiple-choice group.
    if (type === 'multiple_choice' && /choose (two|three|four|five)\b/i.test(text)) {
      return { type: 'multi_select', basis: 'instructions: choose N letters', confident: true };
    }
    return { type, basis, confident: true };
  }
  return fromControl(shape);
}

/** True when the inferred type is answered by picking, not by typing. */
export function isChoiceType(type: QuestionType): boolean {
  return CHOICE_TYPES.has(type);
}

export interface CrossCheck {
  ordinal: number;
  inferred: QuestionType;
  declared: string;
  shape: ControlShape;
  message: string;
}

/**
 * Compare the file's own `questionTypes` entry against what we found.
 *
 * The map encodes the control, so we check it against the control we saw and
 * against whether the inferred type is a choice type. Either mismatch is
 * reported; neither changes the emitted type.
 */
export function crossCheckDeclaredType(
  ordinal: number,
  inferred: QuestionType,
  declared: string | undefined,
  shape: ControlShape,
): CrossCheck | null {
  if (!declared) return null;
  const d = declared.toLowerCase();

  if (d === 'mcq' && shape !== 'radio' && shape !== 'checkbox') {
    return { ordinal, inferred, declared: d, shape, message: `declared 'mcq' but control is ${shape}` };
  }
  if (d === 'text' && (shape === 'radio' || shape === 'checkbox')) {
    return { ordinal, inferred, declared: d, shape, message: `declared 'text' but control is ${shape}` };
  }
  if (d === 'mcq' && !isChoiceType(inferred)) {
    return { ordinal, inferred, declared: d, shape, message: `declared 'mcq' but inferred ${inferred}` };
  }
  if (d === 'text' && isChoiceType(inferred)) {
    return { ordinal, inferred, declared: d, shape, message: `declared 'text' but inferred ${inferred}` };
  }
  return null;
}
