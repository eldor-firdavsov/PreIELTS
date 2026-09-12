import { flushNow, useAnswerStore } from './answerStore.ts';
import { findResultForSession, scoreSession } from './services/sessionService.ts';

/**
 * Freeze the session and score it — docs/ARCHITECTURE.md §3.
 *
 * Two steps, in this order and no other: get every outstanding answer into
 * Postgres, then ask the database to mark them. Nothing about correctness is
 * decided here. `score_session` is a security definer function and is the only
 * thing in the system that reads an answer key.
 */

export class UnflushedAnswersError extends Error {
  constructor(public readonly pending: number) {
    super(
      `${pending} answer${pending === 1 ? '' : 's'} could not be saved. ` +
        'Check your connection and try again; nothing has been submitted.',
    );
    this.name = 'UnflushedAnswersError';
  }
}

export interface SubmitResult {
  resultId: string;
}

/**
 * Submitting with answers still queued would score a paper that is missing
 * them, so a failed flush aborts the submit rather than losing the work.
 */
export async function submitSession(sessionId: string): Promise<SubmitResult> {
  await flushNow();

  const pending = useAnswerStore.getState().dirty.length;
  if (pending > 0) throw new UnflushedAnswersError(pending);

  let resultId: string;
  try {
    resultId = await scoreSession(sessionId);
  } catch (error) {
    // Scoring refuses a session that is not in_progress. That is the intended
    // contract, but it also fires when a first attempt committed and its
    // response was lost. Distinguish the two by looking for the result.
    const existing = await findResultForSession(sessionId).catch(() => null);
    if (existing === null) throw error;
    resultId = existing;
  }

  useAnswerStore.getState().reset();
  return { resultId };
}
