/**
 * Shape of the "Why was I wrong?" analysis for a listening question, and the
 * prompt version that produced it. Types only, no network: the call happens in
 * the `ai-analyze-listening` Edge Function so the Gemini key stays server-side.
 *
 * A separate analyser from reading, and separate on purpose. Reading reasons
 * from a paragraph the student can go back and re-read; listening reasons from
 * a line that went past once, at a moment on the clock. The mistakes are
 * different too — a reading error is usually a misread inference, a listening
 * error is usually a distractor, a correction the speaker made, a paraphrase
 * that was not recognised, or a number written in the wrong form. Pointing a
 * listening question at the reading analyser would explain it from an excerpt
 * that does not exist.
 *
 * Not every listening question carries a stored transcript line. Where none
 * exists the Edge Function says so in the payload and the model is told to
 * admit it rather than invent what was said.
 *
 * PROMPT_VERSION is the cache key's third component in `ai_analyses`. Bump it
 * whenever the prompt or the schema changes: old rows stay readable, and the
 * next request regenerates rather than serving an explanation produced by a
 * prompt that no longer exists. The Edge Function holds its own copy because it
 * runs on Deno and cannot import from src/; that copy is authoritative.
 */
export const PROMPT_VERSION = 'listening-mistake-v1';

/** Mirrors the response schema the Edge Function validates against. */
export interface ListeningMistakeAnalysis {
  what_the_speaker_said: string;
  where_in_the_recording: string;
  why_the_correct_answer_is_correct: string;
  why_your_answer_is_wrong: string;
  likely_listening_mistake: string;
  how_to_avoid_it: string;
}

export const LISTENING_ANALYSIS_SECTIONS: ReadonlyArray<{
  key: keyof ListeningMistakeAnalysis;
  label: string;
}> = [
  { key: 'what_the_speaker_said', label: 'What the speaker actually said' },
  { key: 'where_in_the_recording', label: 'Where it was said' },
  { key: 'why_the_correct_answer_is_correct', label: 'Why the correct answer is correct' },
  { key: 'why_your_answer_is_wrong', label: 'Why your answer is wrong' },
  { key: 'likely_listening_mistake', label: 'The listening mistake' },
  { key: 'how_to_avoid_it', label: 'How to avoid it next time' },
];

/** Runtime guard for a row read back out of `ai_analyses`. */
export function isListeningMistakeAnalysis(value: unknown): value is ListeningMistakeAnalysis {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return LISTENING_ANALYSIS_SECTIONS.every(({ key }) => typeof record[key] === 'string');
}
