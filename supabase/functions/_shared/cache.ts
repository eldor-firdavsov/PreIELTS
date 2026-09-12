/**
 * `ai_analyses` as a cache, on the terms the schema sets.
 *
 * Unique on (scope, subject_id, prompt_version). A hit must return before any
 * model call: the row is not a copy of an answer, it *is* the answer that the
 * student was given, and regenerating it would explain a band they never saw.
 * Rows are never mutated. A changed prompt gets a new `prompt_version`, and the
 * old rows stay readable and auditable.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.115.0';

export async function readCache(
  admin: SupabaseClient,
  scope: string,
  subjectId: string,
  promptVersion: string,
): Promise<{ ok: true; analysis: unknown | null } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from('ai_analyses')
    .select('analysis')
    .eq('scope', scope)
    .eq('subject_id', subjectId)
    .eq('prompt_version', promptVersion)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  return { ok: true, analysis: data ? data.analysis : null };
}

export interface CacheWrite {
  userId: string;
  scope: string;
  subjectId: string;
  promptVersion: string;
  /** Exactly what was sent to the model, plus which model answered. */
  payload: Record<string, unknown>;
  analysis: unknown;
}

/**
 * Store the answer. A duplicate key is not a failure: a concurrent request won
 * the unique index, and the student still gets the same explanation.
 */
export async function writeCache(
  admin: SupabaseClient,
  write: CacheWrite,
): Promise<string | null> {
  const { error } = await admin.from('ai_analyses').insert({
    user_id: write.userId,
    scope: write.scope,
    subject_id: write.subjectId,
    prompt_version: write.promptVersion,
    payload: write.payload,
    analysis: write.analysis,
  });
  if (error && !error.message.includes('duplicate key')) return error.message;
  return null;
}
