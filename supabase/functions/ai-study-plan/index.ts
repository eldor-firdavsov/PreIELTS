/**
 * ai-study-plan — "What should I improve next?", over everything the student
 * has sat.
 *
 * SPEC.md §16 asks for strengths, weaknesses and a recommendation grounded in
 * the student's own data; §4 asks for the single next action on the dashboard.
 * Both are this one plan, read from two screens.
 *
 * §17 says how the data reaches the model, and this function does nothing else.
 * It calls `study_plan_inputs()` — migration 0015, security definer, filtered
 * by auth.uid() — and sends what that returns. Counts and stored bands: no
 * passage, no essay, no transcript, no question prompt, no test history. The
 * function cannot send more than that even if it wanted to, because it never
 * reads anything else.
 *
 * Notice which client asks. The RPC runs as the *caller*, not as the service
 * role, so a student's plan is built from their own rows by construction rather
 * than by a filter this function remembers to apply. The service role appears
 * only afterwards, to read and write the cache.
 *
 * Cache: ai_analyses is unique on (scope, subject_id, prompt_version). The
 * subject here is a fingerprint of the inputs rather than a row id, because a
 * study plan goes stale when the next paper is marked and a mistake analysis
 * never does. Unchanged data returns the stored plan without a model call; one
 * more result is a new fingerprint and a new plan, and the old row is kept.
 */
import { guardMethod, json, serve } from '../_shared/http.ts';
import { adminClient, identifyCaller, readApiKey, readEnv } from '../_shared/supabase.ts';
import { generateJson } from '../_shared/gemini.ts';
import { readCache, writeCache } from '../_shared/cache.ts';

/** Keep in step with src/lib/ai/study-plan.ts. This copy is authoritative. */
const PROMPT_VERSION = 'study-plan-v2';
const SCOPE = 'study_plan';

const SKILLS = ['listening', 'reading'] as const;

/** At most this many of each list. A plan of twelve steps is not a plan. */
const MAX_STRENGTHS = 4;
const MAX_WEAKNESSES = 4;
const MAX_STEPS = 5;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    overall_diagnosis: { type: 'string' },
    strengths: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: { type: 'string' }, evidence: { type: 'string' } },
        required: ['area', 'evidence'],
      },
    },
    weaknesses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          evidence: { type: 'string' },
          what_it_costs: { type: 'string' },
        },
        required: ['area', 'evidence', 'what_it_costs'],
      },
    },
    next_action: {
      type: 'object',
      properties: {
        skill: { type: 'string', enum: [...SKILLS] },
        headline: { type: 'string' },
        detail: { type: 'string' },
      },
      required: ['skill', 'headline', 'detail'],
    },
    practice_plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          focus: { type: 'string' },
          why: { type: 'string' },
          how: { type: 'string' },
        },
        required: ['focus', 'why', 'how'],
      },
    },
    evidence_caveat: { type: 'string' },
  },
  required: [
    'overall_diagnosis',
    'strengths',
    'weaknesses',
    'next_action',
    'practice_plan',
    'evidence_caveat',
  ],
} as const;

const SYSTEM_PROMPT = [
  'You are an IELTS coach reading one student\'s recorded performance and',
  'deciding what they should work on next.',
  '',
  'The JSON below is everything you know. It is counts and bands, already',
  'computed from their completed papers. You have not seen their answers, their',
  'essays or the tests themselves, and you must not write as though you had.',
  '',
  'Ground every claim in a number that is actually in the data, and quote it:',
  '"matching headings, 3 of 14 correct" is a finding, "your matching headings',
  'are weak" is a guess wearing a finding\'s clothes. If a count is too small to',
  'support a claim, do not make the claim — a question type seen four times says',
  'nothing, and telling a student to drill it would send them to practise the',
  'wrong thing.',
  '',
  'Some fields are null because that skill has not been attempted. Never read a',
  'null as a zero and never as a weakness. Say it is untried, and that trying it',
  'is what would tell them where they stand.',
  '',
  'Do not average anything into an overall band: an overall IELTS band is not',
  'the mean of whatever someone happens to have sat.',
  '',
  'Only reading and listening are assessed on this platform. Writing, speaking',
  'and pronunciation are not in the data and must not appear in the plan.',
  '',
  'next_action names the one skill with the most to gain, given the target band',
  'where one is set, and says what to do about it in a sentence a student can',
  'act on today. practice_plan is at most five steps, each one specific enough',
  'to start without asking a follow-up question.',
  '',
  'evidence_caveat states plainly how much this rests on: how many papers, and',
  'what is missing. Do not soften it. A student who has sat one reading test',
  'should be told this is a first read, not a diagnosis.',
  '',
  'Write to the student, in plain sentences. No headings, no bullet markers, no',
  'encouragement that is not a fact about their work.',
].join('\n');

/** What a student sees when Google is over capacity. Not their failure. */
const BUSY_MESSAGE =
  'The coach is busy right now. Nothing has been lost. Try again in a moment.';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

interface Listed {
  [key: string]: string;
}

/**
 * A list of objects whose named fields are all non-empty, capped.
 *
 * An entry with a blank field reads as though the coach had nothing to say
 * about it, which is a different claim from having said nothing.
 */
function readList(value: unknown, fields: string[], limit: number): Listed[] {
  if (!Array.isArray(value)) return [];
  const rows: Listed[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const row: Listed = {};
    let complete = true;
    for (const field of fields) {
      const content = text(record[field]);
      if (content === '') { complete = false; break; }
      row[field] = content;
    }
    if (complete) rows.push(row);
    if (rows.length === limit) break;
  }
  return rows;
}

/**
 * The plan, or null when the parts a plan cannot do without are missing.
 *
 * The diagnosis, the next action and the caveat are required: a plan with no
 * recommendation is not a plan, and one with no caveat overclaims. The three
 * lists may legitimately be short — a student with one paper has little to be
 * told — but the next action must always name a skill the schema allows.
 */
function readPlan(value: Record<string, unknown>): Record<string, unknown> | null {
  const diagnosis = text(value.overall_diagnosis);
  const caveat = text(value.evidence_caveat);
  if (diagnosis === '' || caveat === '') return null;

  const action = value.next_action;
  if (typeof action !== 'object' || action === null) return null;
  const record = action as Record<string, unknown>;
  const skill = text(record.skill);
  const headline = text(record.headline);
  const detail = text(record.detail);
  if (!SKILLS.includes(skill as typeof SKILLS[number]) || headline === '' || detail === '') {
    return null;
  }

  return {
    overall_diagnosis: diagnosis,
    strengths: readList(value.strengths, ['area', 'evidence'], MAX_STRENGTHS),
    weaknesses: readList(value.weaknesses, ['area', 'evidence', 'what_it_costs'], MAX_WEAKNESSES),
    next_action: { skill, headline, detail },
    practice_plan: readList(value.practice_plan, ['focus', 'why', 'how'], MAX_STEPS),
    evidence_caveat: caveat,
  };
}

/** True when there is at least one real attempt to reason from. */
function hasEvidence(inputs: Record<string, unknown>): boolean {
  return Number(inputs.results_counted ?? 0) > 0;
}

async function handle(request: Request): Promise<Response> {
  const guard = guardMethod(request);
  if (guard) return guard;

  const env = readEnv();
  if (!env) return json({ error: 'The function is missing its Supabase environment.' }, 500);

  const identified = await identifyCaller(request, env);
  if (!identified.ok) return identified.response;
  const { userId, client } = identified.caller;

  // ---- the deterministic half, computed as the caller ---------------------
  const { data: rpc, error: rpcError } = await client.rpc('study_plan_inputs');
  if (rpcError) return json({ error: rpcError.message }, 500);

  const envelope = rpc as { fingerprint?: unknown; inputs?: unknown } | null;
  const fingerprint = envelope?.fingerprint;
  const inputs = envelope?.inputs;
  if (typeof fingerprint !== 'string' || typeof inputs !== 'object' || inputs === null) {
    return json({ error: 'The performance summary could not be built.' }, 500);
  }
  const counts = inputs as Record<string, unknown>;

  // An empty history is not a student with no weaknesses; it is a student we
  // know nothing about. Generic advice wearing their name would be worse than
  // saying so.
  if (!hasEvidence(counts)) {
    return json({ plan: null, enough_evidence: false, fingerprint, prompt_version: PROMPT_VERSION });
  }

  const admin = adminClient(env);

  // ---- cache: a hit must not call the API --------------------------------
  const cached = await readCache(admin, SCOPE, fingerprint, PROMPT_VERSION);
  if (!cached.ok) return json({ error: cached.message }, 500);
  if (cached.analysis) {
    return json({
      plan: cached.analysis,
      cached: true,
      enough_evidence: true,
      fingerprint,
      prompt_version: PROMPT_VERSION,
    });
  }

  // ---- ask the model ------------------------------------------------------
  const apiKey = readApiKey();
  if (!apiKey.ok) return apiKey.response;

  const payload = { prompt_version: PROMPT_VERSION, ...counts };
  const outcome = await generateJson({
    apiKey: apiKey.key,
    system: SYSTEM_PROMPT,
    parts: [{ text: JSON.stringify(payload, null, 2) }],
    schema: RESPONSE_SCHEMA,
    // Slightly above the marking calls: this is advice, not a score, and the
    // same three numbers should still be able to produce a readable sentence.
    temperature: 0.3,
  });
  if (!outcome.ok) {
    if (outcome.kind === 'busy') return json({ error: BUSY_MESSAGE }, 503);
    return json({ error: `The plan could not be generated: ${outcome.detail}` }, 502);
  }

  const plan = readPlan(outcome.parsed);
  if (!plan) return json({ error: 'The coach returned an incomplete plan.' }, 502);

  // ---- store, keyed by (scope, fingerprint, prompt_version) ---------------
  const failure = await writeCache(admin, {
    userId,
    scope: SCOPE,
    subjectId: fingerprint,
    promptVersion: PROMPT_VERSION,
    payload: { ...payload, model: outcome.model },
    analysis: plan,
  });
  if (failure) return json({ error: failure }, 500);

  return json({
    plan,
    cached: false,
    enough_evidence: true,
    fingerprint,
    prompt_version: PROMPT_VERSION,
  });
}

serve(handle);
