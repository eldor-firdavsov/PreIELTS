/**
 * Shape of the long-term study plan, and the prompt version that produced it.
 * Types only, no network: the call happens in the `ai-study-plan` Edge Function
 * so the Gemini key stays server-side.
 *
 * SPEC.md §16 asks for strengths, weaknesses, recurring mistakes and "what
 * should I improve next?", all grounded in the student's own data. §17 says how:
 * do the deterministic analysis first, store it, and send only that. The
 * deterministic half is `study_plan_inputs()` in migration 0015, which reduces
 * every paper the student has sat to counts and stored bands. No passage, no
 * essay and no transcript is ever sent.
 *
 * The cache key is unusual and deliberately so. A mistake or an essay never
 * changes, so those analyses are keyed by their subject's id. A study plan is
 * about a moving target: it is right until the next test is marked and wrong
 * afterwards. So the subject is a fingerprint of the inputs themselves, taken
 * over the caller's id and the counts. Unchanged data returns the stored plan
 * without a model call; one more completed paper is a new fingerprint and a new
 * plan, and the old row is kept rather than overwritten, so advice stays
 * readable next to the numbers it was given for.
 *
 * PROMPT_VERSION is the third component of that key. Bump it whenever the
 * prompt or the schema changes. The Edge Function holds its own copy because it
 * runs on Deno and cannot import from src/; that copy is authoritative.
 */
export const PROMPT_VERSION = 'study-plan-v2';

export type StudySkill = 'listening' | 'reading';

/** Something the student does well, with the number that says so. */
export interface StudyStrength {
  area: string;
  evidence: string;
}

/** Something costing marks, with the number that says so and what it costs. */
export interface StudyWeakness {
  area: string;
  evidence: string;
  what_it_costs: string;
}

/** The single thing to do next. SPEC.md §4's "recommended next action". */
export interface StudyNextAction {
  skill: StudySkill;
  headline: string;
  detail: string;
}

/** One step of the plan: what to practise, why, and how to practise it. */
export interface StudyStep {
  focus: string;
  why: string;
  how: string;
}

export interface StudyPlan {
  overall_diagnosis: string;
  strengths: StudyStrength[];
  weaknesses: StudyWeakness[];
  next_action: StudyNextAction;
  practice_plan: StudyStep[];
  /**
   * How thin the evidence is, in the model's own words. One reading paper is
   * not a diagnosis, and a plan that does not say so is overclaiming.
   */
  evidence_caveat: string;
}

const SKILLS: readonly string[] = ['listening', 'reading'];

function isStrength(value: unknown): value is StudyStrength {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.area === 'string' && typeof record.evidence === 'string';
}

function isWeakness(value: unknown): value is StudyWeakness {
  if (!isStrength(value)) return false;
  return typeof (value as unknown as Record<string, unknown>).what_it_costs === 'string';
}

function isStep(value: unknown): value is StudyStep {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.focus === 'string' &&
    typeof record.why === 'string' &&
    typeof record.how === 'string'
  );
}

function isNextAction(value: unknown): value is StudyNextAction {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.skill === 'string' &&
    SKILLS.includes(record.skill) &&
    typeof record.headline === 'string' &&
    typeof record.detail === 'string'
  );
}

/** Runtime guard for a row read back out of `ai_analyses`. */
export function isStudyPlan(value: unknown): value is StudyPlan {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.overall_diagnosis !== 'string') return false;
  if (typeof record.evidence_caveat !== 'string') return false;
  if (!isNextAction(record.next_action)) return false;
  if (!Array.isArray(record.strengths) || !record.strengths.every(isStrength)) return false;
  if (!Array.isArray(record.weaknesses) || !record.weaknesses.every(isWeakness)) return false;
  if (!Array.isArray(record.practice_plan) || !record.practice_plan.every(isStep)) return false;
  return true;
}

/**
 * What the student has done, as `study_plan_inputs()` counted it.
 *
 * The client reads this for one reason only: to know the fingerprint, so it can
 * look for a stored plan before offering to generate a new one, and to know
 * whether there is enough evidence to ask for a plan at all. It is not a source
 * of numbers for the screen — those come from the `result_*` views, already
 * computed.
 */
export interface StudyPlanInputs {
  fingerprint: string;
  results_counted: number;
}

/**
 * The threshold, stated once.
 *
 * One marked paper is thin, and the plan will say so — but it is real evidence
 * about a real attempt. Nothing at all is not, and asking a model to plan from
 * an empty history would produce generic advice wearing the student's name.
 */
export function hasEnoughEvidence(inputs: StudyPlanInputs): boolean {
  return inputs.results_counted > 0;
}

/** Reads the RPC's return value, which is plain jsonb. */
export function readStudyPlanInputs(value: unknown): StudyPlanInputs | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const inputs = record.inputs;
  if (typeof record.fingerprint !== 'string') return null;
  if (typeof inputs !== 'object' || inputs === null) return null;
  const counts = inputs as Record<string, unknown>;
  return {
    fingerprint: record.fingerprint,
    results_counted: Number(counts.results_counted ?? 0),
  };
}
