import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Turning a wire-level failure into something addressed to the reader.
 *
 * The same idea as `src/lib/ai/errors.ts`, for the same reason. When the
 * database is missing a migration the client depends on, PostgREST answers
 * "Could not find the function public.start_or_resume_session(p_test_id) in the
 * schema cache". That sentence is true, it is useful, and it is addressed to
 * whoever deploys this — not to a student who has just clicked into a reading
 * paper and now has no idea whether the fault is theirs.
 *
 * Nothing here hides a failure. The test did not open either way. This only
 * changes who the sentence is talking to, and says plainly that the deployment
 * is unfinished rather than leaving the reader to guess.
 *
 * The deploy order this catches is real and worth naming: the client's RPC
 * calls are a contract with the migrations, so a frontend that ships ahead of
 * `supabase db push` breaks every route that starts a session.
 */

/** PostgREST's code for a function the schema cache does not know about. */
const MISSING_FUNCTION = 'PGRST202';

const MISSING_FUNCTION_TEXT = /Could not find the function|in the schema cache/i;

function isMissingFunction(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as Partial<PostgrestError>;
  if (record.code === MISSING_FUNCTION) return true;
  return typeof record.message === 'string' && MISSING_FUNCTION_TEXT.test(record.message);
}

/**
 * The message to throw for a failed RPC.
 *
 * `what` names the thing the student was trying to do, so the sentence reads as
 * being about their action rather than about a function name.
 */
export function rpcErrorMessage(error: PostgrestError | null, what: string): string {
  if (!error) return `${what} failed.`;
  if (isMissingFunction(error)) {
    return (
      `${what} is not available on this deployment yet: the database is missing an update ` +
      'the app needs. Nothing you have done has been lost. Whoever set this up needs to run ' +
      'the outstanding migrations.'
    );
  }
  return error.message;
}
