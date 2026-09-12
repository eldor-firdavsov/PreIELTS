import { supabase } from '../../../lib/supabase/client.ts';
import { rpcErrorMessage } from '../../../lib/supabase/errors.ts';
import {
  PROMPT_VERSION as STUDY_PLAN_PROMPT_VERSION,
  hasEnoughEvidence,
  isStudyPlan,
  readStudyPlanInputs,
  type StudyNextAction,
} from '../../../lib/ai/study-plan.ts';

/**
 * What the student sees on arrival: where they are, and what is missing.
 *
 * Every band here is a stored row. The service picks which row to show — the
 * most recent for each skill — but never computes one. Choosing a row is not
 * arithmetic; averaging them would be, and would be wrong, because an
 * overall IELTS band is not the mean of whatever you happen to have sat.
 */

export type SkillKind = 'listening' | 'reading';

export const SKILL_ORDER: SkillKind[] = ['listening', 'reading'];

export interface SkillStanding {
  kind: SkillKind;
  /** Most recent band for this skill, or null if never attempted. */
  band: number | null;
  recordedAt: string | null;
  /** Change against the attempt before it. Null when there is only one. */
  delta: number | null;
  attempts: number;
}

export interface RecentResult {
  resultId: string;
  title: string;
  band: number | null;
  createdAt: string;
}

export interface Dashboard {
  fullName: string | null;
  targetBand: number | null;
  skills: SkillStanding[];
  recent: RecentResult[];
  totalTests: number;
}

export async function fetchDashboard(): Promise<Dashboard> {
  const [profile, progress, recent] = await Promise.all([
    supabase.from('profiles').select('full_name, target_band').maybeSingle(),
    supabase.from('user_progress').select('kind, band, recorded_at')
      .order('recorded_at', { ascending: false }),
    supabase.from('result_overview').select('result_id, test_title, overall_band, created_at')
      .order('created_at', { ascending: false }).limit(5),
  ]);
  for (const response of [profile, progress, recent]) {
    if (response.error) throw new Error(response.error.message);
  }

  const rows = progress.data ?? [];
  const skills: SkillStanding[] = SKILL_ORDER.map((kind) => {
    const forSkill = rows.filter((row) => row.kind === kind);
    const latest = forSkill[0];
    const previous = forSkill[1];
    return {
      kind,
      band: latest?.band ?? null,
      recordedAt: latest?.recorded_at ?? null,
      delta:
        latest?.band !== undefined && previous?.band !== undefined
          ? Math.round((latest.band - previous.band) * 10) / 10
          : null,
      attempts: forSkill.length,
    };
  });

  return {
    fullName: profile.data?.full_name ?? null,
    targetBand: profile.data?.target_band ?? null,
    skills,
    totalTests: new Set(rows.map((row) => row.recorded_at)).size,
    recent: (recent.data ?? [])
      .filter((row) => row.result_id !== null)
      .map((row) => ({
        resultId: row.result_id as string,
        title: row.test_title ?? 'Untitled test',
        band: row.overall_band,
        createdAt: row.created_at as string,
      })),
  };
}

/* ------------------------------------------------------- recommended action */

/**
 * SPEC.md §4's "recommended next action", read rather than written.
 *
 * The dashboard never asks a model for anything. It shows the one line from a
 * plan the student already generated on the Analysis page, and shows nothing
 * when there is none: a student who opens their dashboard has not asked for
 * coaching, and a page that quietly spends a model call on arrival is a page
 * that costs money for being looked at.
 *
 * Two small reads rather than an import from the analysis feature, which is the
 * rule this codebase holds to. The fingerprint is what makes the second read
 * honest: it matches only while the numbers the plan was written from are still
 * the student's current numbers, so a stale recommendation cannot survive the
 * next completed test.
 */
export type NextAction = StudyNextAction;

export async function fetchNextAction(): Promise<NextAction | null> {
  const { data, error } = await supabase.rpc('study_plan_inputs');
  if (error) throw new Error(rpcErrorMessage(error, 'Reading your progress'));

  const inputs = readStudyPlanInputs(data);
  if (!inputs || !hasEnoughEvidence(inputs)) return null;

  const stored = await supabase
    .from('ai_analyses')
    .select('analysis')
    .eq('scope', 'study_plan')
    .eq('subject_id', inputs.fingerprint)
    .eq('prompt_version', STUDY_PLAN_PROMPT_VERSION)
    .maybeSingle();
  if (stored.error) throw new Error(stored.error.message);
  if (!stored.data || !isStudyPlan(stored.data.analysis)) return null;

  return stored.data.analysis.next_action;
}
