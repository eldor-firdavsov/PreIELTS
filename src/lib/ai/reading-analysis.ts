/**
 * Shape of the "Why was I wrong?" analysis, and the prompt version that
 * produced it. Types only, no network: the call happens in the
 * `ai-analyze-reading` Edge Function so the Gemini key stays server-side.
 *
 * PROMPT_VERSION is the cache key's third component. Bump it whenever the
 * prompt or the schema changes: old rows stay readable and auditable, and the
 * next request regenerates rather than serving an explanation produced by a
 * prompt that no longer exists.
 *
 * The Edge Function holds its own copy of this constant and of the schema,
 * because it runs on Deno and cannot import from src/. It is authoritative. If
 * the two drift the client simply makes one extra function call, which then
 * hits the server-side cache and returns without touching the API.
 */
export const PROMPT_VERSION = 'reading-mistake-v2';

/** Mirrors the response schema the Edge Function validates against. */
export interface ReadingMistakeAnalysis {
  what_the_passage_says: string;
  where_to_find_it: string;
  why_the_correct_answer_is_correct: string;
  why_your_answer_is_wrong: string;
  likely_reasoning_mistake: string;
  how_to_avoid_it: string;
}

export const ANALYSIS_SECTIONS: ReadonlyArray<{
  key: keyof ReadingMistakeAnalysis;
  label: string;
}> = [
  { key: 'what_the_passage_says', label: 'What the passage actually says' },
  { key: 'where_to_find_it', label: 'Where the answer is' },
  { key: 'why_the_correct_answer_is_correct', label: 'Why the correct answer is correct' },
  { key: 'why_your_answer_is_wrong', label: 'Why your answer is wrong' },
  { key: 'likely_reasoning_mistake', label: 'The reasoning mistake' },
  { key: 'how_to_avoid_it', label: 'How to avoid it next time' },
];

/** Runtime guard for a row read back out of `ai_analyses`. */
export function isReadingMistakeAnalysis(value: unknown): value is ReadingMistakeAnalysis {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ANALYSIS_SECTIONS.every(({ key }) => typeof record[key] === 'string');
}
