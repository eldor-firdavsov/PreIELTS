import { supabase } from '../../../lib/supabase/client.ts';
import { rpcErrorMessage } from '../../../lib/supabase/errors.ts';
import type { Tables } from '../../../lib/supabase/types.generated.ts';
import { aiErrorMessage } from '../../../lib/ai/errors.ts';
import {
  PROMPT_VERSION,
  hasEnoughEvidence,
  isStudyPlan,
  readStudyPlanInputs,
  type StudyPlan,
} from '../../../lib/ai/study-plan.ts';

/**
 * The long view: how each skill has moved, and which question types keep
 * costing marks.
 *
 * The per-type totals are summed across results here rather than in a view, and
 * that is the one place this file does arithmetic. It is counting, not scoring:
 * adding up how many matching_headings questions were answered and how many
 * were right. No band is derived from it, and none may be.
 */

export interface ProgressPoint {
  kind: string;
  band: number;
  recordedAt: string;
}

export interface TypeWeakness {
  questionType: string;
  total: number;
  correct: number;
  /** Percent, rounded. Only meaningful once `total` is worth reading. */
  percentCorrect: number;
}

export interface Analysis {
  progress: ProgressPoint[];
  weakest: TypeWeakness[];
  resultsCounted: number;
}

/** Below this a percentage is noise, so the page says so rather than ranking it. */
export const MIN_ATTEMPTS_TO_RANK = 5;

export async function fetchAnalysis(): Promise<Analysis> {
  const [progress, types] = await Promise.all([
    supabase.from('user_progress').select('kind, band, recorded_at')
      .order('recorded_at', { ascending: true }),
    supabase.from('result_type_accuracy').select('result_id, question_type, total, correct'),
  ]);
  for (const response of [progress, types]) {
    if (response.error) throw new Error(response.error.message);
  }

  const rows = (types.data ?? []) as Array<Tables<'result_type_accuracy'>>;
  const totals = new Map<string, { total: number; correct: number }>();
  for (const row of rows) {
    if (!row.question_type) continue;
    const entry = totals.get(row.question_type) ?? { total: 0, correct: 0 };
    entry.total += row.total ?? 0;
    entry.correct += row.correct ?? 0;
    totals.set(row.question_type, entry);
  }

  const weakest: TypeWeakness[] = [...totals.entries()]
    .map(([questionType, { total, correct }]) => ({
      questionType,
      total,
      correct,
      percentCorrect: total > 0 ? Math.round((correct / total) * 100) : 0,
    }))
    .sort((a, b) => a.percentCorrect - b.percentCorrect || b.total - a.total);

  return {
    progress: (progress.data ?? [])
      .filter((row) => row.kind !== null && row.band !== null)
      .map((row) => ({ kind: row.kind, band: row.band, recordedAt: row.recorded_at })),
    weakest,
    resultsCounted: new Set(rows.map((row) => row.result_id)).size,
  };
}

/* --------------------------------------------------------------- study plan */

/**
 * "What should I improve next?" — SPEC.md §16.
 *
 * Two calls, and the difference between them matters. `fetchStudyPlanState`
 * only reads: it asks the database what the student's numbers currently
 * fingerprint to, and looks for a plan already stored against that fingerprint.
 * No model is involved, so opening this page costs nothing. `requestStudyPlan`
 * is the model call, and it happens when the student asks for it.
 *
 * The fingerprint is why the stored plan can be trusted. It is a digest of the
 * counts the plan was written from, so a plan is served back only while those
 * counts are unchanged. Sit another test and the fingerprint moves, no stored
 * plan matches it, and the page offers to write a new one rather than showing
 * advice about a paper that is no longer the latest.
 */

export interface StudyPlanState {
  /** Null until a plan has been generated for the current numbers. */
  plan: StudyPlan | null;
  /** False when the student has not completed anything to reason from. */
  enoughEvidence: boolean;
  fingerprint: string;
}

export async function fetchStudyPlanState(): Promise<StudyPlanState> {
  const { data, error } = await supabase.rpc('study_plan_inputs');
  if (error) throw new Error(rpcErrorMessage(error, 'Building your study plan'));

  const inputs = readStudyPlanInputs(data);
  if (!inputs) throw new Error('Your performance summary could not be read.');

  const enoughEvidence = hasEnoughEvidence(inputs);
  if (!enoughEvidence) {
    return { plan: null, enoughEvidence, fingerprint: inputs.fingerprint };
  }

  const stored = await supabase
    .from('ai_analyses')
    .select('analysis')
    .eq('scope', 'study_plan')
    .eq('subject_id', inputs.fingerprint)
    .eq('prompt_version', PROMPT_VERSION)
    .maybeSingle();
  if (stored.error) throw new Error(stored.error.message);

  return {
    plan: stored.data && isStudyPlan(stored.data.analysis) ? stored.data.analysis : null,
    enoughEvidence,
    fingerprint: inputs.fingerprint,
  };
}

/**
 * Ask the Edge Function to write the plan.
 *
 * The function repeats the fingerprint and the cache check itself, so a second
 * click costs nothing even when the read above missed. The Gemini key never
 * reaches the browser.
 */
export async function requestStudyPlan(): Promise<StudyPlanState> {
  const { data, error } = await supabase.functions.invoke('ai-study-plan', { body: {} });
  if (error) throw new Error(aiErrorMessage(await readInvokeError(error)));

  const payload = data as {
    plan?: unknown;
    enough_evidence?: boolean;
    fingerprint?: unknown;
  } | null;
  if (!payload || typeof payload.fingerprint !== 'string') {
    throw new Error('The coach returned an unexpected response.');
  }
  if (payload.enough_evidence === false) {
    return { plan: null, enoughEvidence: false, fingerprint: payload.fingerprint };
  }
  if (!isStudyPlan(payload.plan)) {
    throw new Error('The coach returned an unexpected response.');
  }
  return { plan: payload.plan, enoughEvidence: true, fingerprint: payload.fingerprint };
}

/**
 * supabase-js reports a non-2xx function response as "Edge Function returned a
 * non-2xx status code" and hides the body, which is where the actual reason
 * lives. Read it, so `aiErrorMessage` gets the server's own sentence to work
 * from rather than a status code that tells the student nothing.
 */
async function readInvokeError(error: unknown): Promise<string> {
  const response = (error as { context?: unknown })?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Not JSON. Fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : String(error);
}
