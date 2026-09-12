/**
 * ai-analyze-reading — "Why was I wrong?" for one reading mistake.
 *
 * Runs in Deno on Supabase Edge Functions so GEMINI_API_KEY never reaches a
 * browser. SPEC.md §17: deterministic analysis is already stored, and only a
 * minimal structured payload is sent to the model.
 *
 * What is sent: the question, its type, the student's answer, the correct
 * answer, the time spent, the group instructions, and ONE passage paragraph.
 * Never the whole passage, and never the other passages of the paper.
 *
 * Cache: ai_analyses is unique on (scope, subject_id, prompt_version). A hit
 * returns before any Gemini call is made. Bump PROMPT_VERSION to regenerate.
 */
import { guardMethod, json, readBody, serve } from '../_shared/http.ts';
import { adminClient, identifyCaller, readApiKey, readEnv } from '../_shared/supabase.ts';
import { generateJson } from '../_shared/gemini.ts';
import { readCache, writeCache } from '../_shared/cache.ts';

/** Keep in step with src/lib/ai/reading-analysis.ts. This copy is authoritative. */
const PROMPT_VERSION = 'reading-mistake-v2';
const SCOPE = 'mistake';

/** The six fields an explanation is made of, in the order they are shown. */
const FIELDS = [
  'what_the_passage_says',
  'where_to_find_it',
  'why_the_correct_answer_is_correct',
  'why_your_answer_is_wrong',
  'likely_reasoning_mistake',
  'how_to_avoid_it',
] as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'string' }])),
  required: [...FIELDS],
} as const;

const SYSTEM_PROMPT = [
  'You are an IELTS Reading tutor explaining one question a student got wrong.',
  '',
  'You are given only the material below. Do not invent passage content: if the',
  'excerpt does not contain what you need, say so plainly in the relevant field',
  'rather than guessing at what the rest of the passage might say.',
  '',
  'Write for a student at roughly band 6. Be concrete and specific to this',
  'question. Two or three sentences per field. No preamble, no encouragement,',
  'no restating the question back.',
].join('\n');

/** What a student sees when Google is over capacity. Not their failure. */
const BUSY_MESSAGE =
  'The explanation service is busy right now. Nothing has been lost. Try again in a moment.';

interface Paragraph {
  label: string | null;
  text: string;
}

/**
 * The analysis, or null when any field is missing. Five explanations out of six
 * is not an explanation: a blank heading reads as though the model had nothing
 * to say about that question, which is a different claim from a failed call.
 */
function readAnalysis(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const analysis: Record<string, string> = {};
  for (const field of FIELDS) {
    const text = record[field];
    if (typeof text !== 'string' || text.trim() === '') return null;
    analysis[field] = text;
  }
  return analysis;
}

/** The one paragraph worth sending, or null when we cannot locate it. */
function selectExcerpt(
  paragraphs: Paragraph[],
  evidence: { kind?: string; paragraph_index?: number } | null,
  correctAnswer: string | null,
): { paragraph: Paragraph | null; basis: string } {
  if (evidence?.kind === 'passage' && typeof evidence.paragraph_index === 'number') {
    const paragraph = paragraphs[evidence.paragraph_index];
    if (paragraph) return { paragraph, basis: 'recorded evidence offset' };
  }

  // No marker. Locate the answer text ourselves, but only accept an
  // unambiguous single hit: one wrong paragraph is worse than none.
  if (correctAnswer && correctAnswer.trim().length >= 3) {
    const needle = correctAnswer.trim().toLowerCase();
    const hits = paragraphs.filter((p) => p.text.toLowerCase().includes(needle));
    if (hits.length === 1) return { paragraph: hits[0], basis: 'unique match on the correct answer' };
  }

  return { paragraph: null, basis: 'no excerpt could be located' };
}

function answerToText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

async function handle(request: Request): Promise<Response> {
  const guard = guardMethod(request);
  if (guard) return guard;

  const env = readEnv();
  if (!env) return json({ error: 'The function is missing its Supabase environment.' }, 500);

  const identified = await identifyCaller(request, env);
  if (!identified.ok) return identified.response;
  const { userId } = identified.caller;

  const body = await readBody(request);
  if (!body) return json({ error: 'Body must be JSON.' }, 400);
  const mistakeId = body.mistake_id;
  if (typeof mistakeId !== 'string' || mistakeId === '') {
    return json({ error: 'mistake_id is required.' }, 400);
  }

  const admin = adminClient(env);

  // ---- the mistake, and proof the caller owns it -------------------------
  const { data: mistake, error: mistakeError } = await admin
    .from('mistakes')
    .select('id, user_id, question_id, question_type, user_answer, correct_answer, time_spent_seconds')
    .eq('id', mistakeId)
    .maybeSingle();
  if (mistakeError) return json({ error: mistakeError.message }, 500);
  if (!mistake) return json({ error: 'Mistake not found.' }, 404);
  if (mistake.user_id !== userId) return json({ error: 'Not your mistake.' }, 403);

  // ---- cache: a hit must not call the API --------------------------------
  const cached = await readCache(admin, SCOPE, mistakeId, PROMPT_VERSION);
  if (!cached.ok) return json({ error: cached.message }, 500);
  if (cached.analysis) {
    return json({ analysis: cached.analysis, cached: true, prompt_version: PROMPT_VERSION });
  }

  // ---- assemble the minimal payload --------------------------------------
  const { data: question, error: questionError } = await admin
    .from('questions')
    .select('ordinal, type, prompt, evidence, group_id, question_groups!inner(instructions, section_id)')
    .eq('id', mistake.question_id)
    .single();
  if (questionError) return json({ error: questionError.message }, 500);

  const group = question.question_groups as unknown as { instructions: string | null; section_id: string };
  const { data: section, error: sectionError } = await admin
    .from('sections')
    .select('kind, stimulus')
    .eq('id', group.section_id)
    .single();
  if (sectionError) return json({ error: sectionError.message }, 500);

  // A listening question asked of the reading analyser would be explained from
  // a passage that does not exist. It has its own analyser; send it there.
  if (section.kind !== 'reading') {
    return json({ error: 'That question is not from a reading section.' }, 400);
  }

  const stimulus = section.stimulus as { type?: string; title?: string; paragraphs?: unknown };
  const paragraphs: Paragraph[] = Array.isArray(stimulus.paragraphs)
    ? (stimulus.paragraphs as Array<Record<string, unknown>>).map((p) => ({
        label: typeof p.label === 'string' ? p.label : null,
        text: String(p.text ?? ''),
      }))
    : [];

  const correctText = answerToText(mistake.correct_answer);
  const { paragraph, basis } = selectExcerpt(
    paragraphs,
    question.evidence as { kind?: string; paragraph_index?: number } | null,
    correctText,
  );

  const payload = {
    prompt_version: PROMPT_VERSION,
    question_number: question.ordinal,
    question_type: question.type,
    question: question.prompt,
    instructions: group.instructions,
    user_answer: answerToText(mistake.user_answer),
    correct_answer: correctText,
    time_spent_seconds: mistake.time_spent_seconds,
    passage_title: typeof stimulus.title === 'string' ? stimulus.title : null,
    // One paragraph at most. The rest of the paper is never sent.
    passage_excerpt: paragraph ? { label: paragraph.label, text: paragraph.text } : null,
    passage_excerpt_basis: basis,
  };

  // ---- ask the model ------------------------------------------------------
  const apiKey = readApiKey();
  if (!apiKey.ok) return apiKey.response;

  const outcome = await generateJson({
    apiKey: apiKey.key,
    system: SYSTEM_PROMPT,
    parts: [{ text: JSON.stringify(payload, null, 2) }],
    schema: RESPONSE_SCHEMA,
  });
  if (!outcome.ok) {
    if (outcome.kind === 'busy') return json({ error: BUSY_MESSAGE }, 503);
    return json({ error: `The explanation could not be generated: ${outcome.detail}` }, 502);
  }

  const analysis = readAnalysis(outcome.parsed);
  if (!analysis) return json({ error: 'The model returned an incomplete analysis.' }, 502);

  // ---- store, keyed by (scope, subject_id, prompt_version) ----------------
  const failure = await writeCache(admin, {
    userId,
    scope: SCOPE,
    subjectId: mistakeId,
    promptVersion: PROMPT_VERSION,
    payload: { ...payload, model: outcome.model },
    analysis,
  });
  if (failure) return json({ error: failure }, 500);

  return json({ analysis, cached: false, prompt_version: PROMPT_VERSION });
}

serve(handle);
