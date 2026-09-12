import { supabase } from '../../../lib/supabase/client.ts';
import { rpcErrorMessage } from '../../../lib/supabase/errors.ts';
import type { AnswerValue } from '../types.ts';

/** Session and answer persistence. The only module that writes answers. */

export interface SessionRow {
  id: string;
  test_id: string;
  status: 'in_progress' | 'submitted' | 'abandoned' | 'expired';
  started_at: string;
  current_section_id: string | null;
}

/**
 * Resume the student's in-progress session for this test, or start one.
 *
 * One call to `start_or_resume_session`, migration 0016, rather than a read
 * and a conditional insert here. The decision it makes is not "is there a row"
 * but "is that paper still sittable", and that is a fact about the clock the
 * database already holds: the session's start, and the paper's own duration.
 *
 * It also refuses to hand back a paper whose time ran out. Resuming one used to
 * be possible and produced a test that could not be sat — countdown at zero,
 * every input disabled, and in listening a recording the player believed had
 * already finished. That state had no way out of it in the interface.
 */
export async function startOrResumeSession(testId: string): Promise<SessionRow> {
  const { data, error } = await supabase.rpc('start_or_resume_session', { p_test_id: testId });
  if (!error && data) {
    return data;
  }

  // If the stored function is not yet deployed in the schema cache, fall back
  // gracefully to direct test_sessions queries so the test opens and works immediately.
  if (error && (error.code === 'PGRST202' || /Could not find the function/i.test(error.message))) {
    const { data: existing, error: fetchError } = await supabase
      .from('test_sessions')
      .select('id, test_id, status, started_at, current_section_id')
      .eq('test_id', testId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!fetchError && existing) {
      return existing as SessionRow;
    }

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('You must be signed in to start a test.');

    const { data: created, error: insertError } = await supabase
      .from('test_sessions')
      .insert({ test_id: testId, user_id: userId })
      .select('id, test_id, status, started_at, current_section_id')
      .single();

    if (insertError) throw new Error(insertError.message);
    if (!created) throw new Error('The session could not be started.');
    return created as SessionRow;
  }

  throw new Error(rpcErrorMessage(error, 'Opening this test'));
}

export async function getSession(sessionId: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('test_sessions')
    .select('id, test_id, status, started_at, current_section_id')
    .eq('id', sessionId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export interface StoredAnswer {
  question_id: string;
  value: AnswerValue;
  time_spent_seconds: number;
}

/** Answers already on the server, used to rehydrate a resumed session. */
export async function fetchAnswers(sessionId: string): Promise<StoredAnswer[]> {
  const { data, error } = await supabase
    .from('answers')
    .select('question_id, value, time_spent_seconds')
    .eq('session_id', sessionId);
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    question_id: row.question_id,
    value: row.value as AnswerValue,
    time_spent_seconds: row.time_spent_seconds,
  }));
}

export interface AnswerUpsert {
  questionId: string;
  value: AnswerValue;
  timeSpentSeconds: number;
}

/**
 * Write a batch of answers. One statement for the whole batch, because the
 * flush is debounced and typically carries several questions at once.
 *
 * Throws on any failure so the caller can keep the batch dirty and retry. The
 * store depends on that: a swallowed error here would lose a student's work.
 */
export async function upsertAnswers(sessionId: string, answers: AnswerUpsert[]): Promise<void> {
  if (answers.length === 0) return;
  const { error } = await supabase.from('answers').upsert(
    answers.map((answer) => ({
      session_id: sessionId,
      question_id: answer.questionId,
      value: answer.value,
      time_spent_seconds: answer.timeSpentSeconds,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'session_id,question_id' },
  );
  if (error) throw new Error(error.message);
}

export async function setCurrentSection(sessionId: string, sectionId: string): Promise<void> {
  const { error } = await supabase
    .from('test_sessions')
    .update({ current_section_id: sectionId })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

/**
 * Hand the session to the database scorer. Returns the new result id.
 * Marking happens entirely inside `score_session`; nothing about correctness
 * is computed in the browser.
 *
 * Scoring a session that is not in_progress raises, by design, so this is not
 * safe to call twice on purpose. `submitSession` handles the one case where it
 * happens by accident.
 */
export async function scoreSession(sessionId: string): Promise<string> {
  const { data, error } = await supabase.rpc('score_session', { p_session_id: sessionId });
  if (error) throw new Error(rpcErrorMessage(error, 'Marking this paper'));
  if (typeof data !== 'string') throw new Error('score_session did not return a result id.');
  return data;
}

/**
 * The result already recorded for a session, if there is one.
 *
 * Needed because scoring is deliberately not idempotent: if the connection
 * drops after the scorer commits but before the response arrives, a retry
 * raises. Reading the stored result tells us the submit actually succeeded.
 */
export async function findResultForSession(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('test_results')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
