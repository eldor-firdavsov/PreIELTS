import type { RendererRegistry } from '../../engine/index.ts';
import { ChoiceRenderer, MatchingRenderer, TextRenderer, BankedTextRenderer } from '../../engine/index.ts';

/**
 * Every listening question type in the corpus, registered explicitly.
 *
 * The renderers are the engine's, shared with reading, because the interactions
 * are genuinely the same: a form or a set of notes is a text box whatever you
 * were listening to, and a map label is a choice from a shared list of letters.
 * What differs between reading and listening is the stimulus, not the answering.
 *
 * map_labelling is a dropdown over the group's shared options for now. The four
 * such questions in the corpus carry lettered options and no image, so a picker
 * answers them honestly; a real labelled diagram would be its own renderer and
 * one changed line here.
 */
export const listeningRenderers: RendererRegistry = {
  multiple_choice: ChoiceRenderer,
  matching_information: MatchingRenderer,
  map_labelling: MatchingRenderer,
  sentence_completion: TextRenderer,
  // Listening notes come with a word bank in some papers and not in others,
  // the same as reading's summary questions.
  note_completion: BankedTextRenderer,
  form_completion: TextRenderer,
};
