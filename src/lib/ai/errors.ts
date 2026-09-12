/**
 * Turning an Edge Function failure into something a person can act on.
 *
 * The functions return honest, specific messages, but two of them are about
 * configuration rather than about the student's work, and a student reading
 * "GEMINI_API_KEY is not configured for this function" has been handed
 * someone else's problem with no way to tell whether their essay was lost.
 * Rewrite those two, leave everything else exactly as the server said it.
 *
 * Nothing here hides a failure. The evaluation did not happen either way; this
 * only changes who the sentence is addressed to.
 */

const MISSING_KEY = /(GEMINI|ANTHROPIC)_API_KEY is not configured/i;
const MISSING_ENV = /missing its Supabase environment/i;

export interface AiFailure {
  /** What to show the student. */
  message: string;
  /** True when the cause is setup, not the submission. Worth saying so. */
  configuration: boolean;
}

export function describeAiFailure(error: unknown): AiFailure {
  const raw = error instanceof Error ? error.message : String(error);

  if (MISSING_KEY.test(raw)) {
    return {
      configuration: true,
      message:
        'Marking is not switched on for this deployment yet. Your work has been saved and ' +
        'nothing is lost; it can be marked as soon as the model key is configured.',
    };
  }
  if (MISSING_ENV.test(raw)) {
    return {
      configuration: true,
      message:
        'The marking service is misconfigured. Your work has been saved and can be marked ' +
        'once it is fixed.',
    };
  }
  return { configuration: false, message: raw };
}

/** The message alone, for the common case where the caller only shows text. */
export function aiErrorMessage(error: unknown): string {
  return describeAiFailure(error).message;
}
