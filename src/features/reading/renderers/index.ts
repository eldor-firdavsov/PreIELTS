import type { RendererRegistry } from '../../engine/index.ts';
import { BankedTextRenderer, ChoiceRenderer, MatchingRenderer, TextRenderer } from '../../engine/index.ts';

/**
 * Every reading question type in the corpus, registered explicitly.
 *
 * The renderers themselves live in the engine, because listening needs the same
 * three interactions and a feature may not import another feature. What stays
 * here is the mapping, which is the part that is genuinely reading's business:
 * giving one reading type its own behaviour later is a one-line change here and
 * nothing else.
 *
 * note_completion is a text box in reading too. It appears in three of the
 * seeded reading papers, and without an entry here those questions rendered the
 * engine's "not supported yet" placeholder instead of an input.
 *
 * summary_completion and note_completion use BankedTextRenderer because both
 * appear with and without a printed word bank. Choosing by the presence of
 * options rather than by the type is the only way one entry can serve a
 * question answered with a word and a question answered with a letter.
 */
export const readingRenderers: RendererRegistry = {
  multiple_choice: ChoiceRenderer,
  true_false_not_given: ChoiceRenderer,
  yes_no_not_given: ChoiceRenderer,
  matching_headings: MatchingRenderer,
  matching_information: MatchingRenderer,
  sentence_completion: TextRenderer,
  summary_completion: BankedTextRenderer,
  short_answer: TextRenderer,
  note_completion: BankedTextRenderer,
};
