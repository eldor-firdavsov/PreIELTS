import type { QuestionRendererProps } from '../QuestionRenderer.tsx';
import { MatchingRenderer } from './MatchingRenderer.tsx';
import { TextRenderer } from './TextRenderer.tsx';

/**
 * A completion question that may or may not come with a word bank.
 *
 * Summary and note completion appear in two forms in the corpus. Sometimes the
 * student writes a word from the passage, and sometimes they pick a letter from
 * a printed list of options. The instructions differ, the answer key differs —
 * one holds "threatened", the other holds "E" — but the question type is the
 * same, so one registry entry has to serve both.
 *
 * Deciding by shape rather than by type is what keeps that honest. Four
 * questions in the seeded corpus had a letter answer key and no visible list,
 * so they rendered a text box a student could not possibly fill correctly. A
 * bank is shown when one exists, and never invented when one does not.
 */
export function BankedTextRenderer(props: QuestionRendererProps) {
  const bank = props.question.options ?? props.group.sharedOptions;
  const banked = Array.isArray(bank) && bank.length > 0;
  return banked ? <MatchingRenderer {...props} /> : <TextRenderer {...props} />;
}
