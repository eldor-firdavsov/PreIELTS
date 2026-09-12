/**
 * ai-analyze-listening — "Why was I wrong?" for one listening question.
 *
 * The counterpart to ai-analyze-reading, and deliberately not the same
 * function. Reading explains a mistake from a paragraph the student can go back
 * and re-read; listening explains one from a line that went past once, at a
 * moment on the clock. Asking the reading analyser about a listening question
 * would have it reason from a passage excerpt that does not exist.
 *
 * What is sent: the question, its type, the student's answer, the correct
 * answer, the time spent, the group instructions, which section of the paper it
 * came from, and ONE transcript line — the same stored marker the results page
 * uses to replay that moment. Never a whole transcript, and never the rest of
 * the paper.
 *
 * Where no marker is stored the payload says so and the model is instructed to
 * admit it. A guessed line is worse than no line: it teaches the student that
 * the recording said something it never said.
 *
 * Cache: ai_analyses is unique on (scope, subject_id, prompt_version). A hit
 * returns before any Gemini call. Bump PROMPT_VERSION to regenerate.
 */
import { guardMethod, json, readBody, serve } from '../_shared/http.ts';
import { adminClient, identifyCaller, readApiKey, readEnv } from '../_shared/supabase.ts';
import { generateJson } from '../_shared/gemini.ts';
import { readCache, writeCache } from '../_shared/cache.ts';

/** Keep in step with src/lib/ai/listening-analysis.ts. This copy is authoritative. */
const PROMPT_VERSION = 'listening-mistake-v1';
const SCOPE = 'listening_mistake';

/** The six fields an explanation is made of, in the order they are shown. */
const FIELDS = [
  'what_the_speaker_said',
  'where_in_the_recording',
  'why_the_correct_answer_is_correct',
  'why_your_answer_is_wrong',
  'likely_listening_mistake',
  'how_to_avoid_it',
] as const;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'string' }])),
  required: [...FIELDS],
} as const;

const SYSTEM_PROMPT = [
  'You are an IELTS Listening tutor explaining one question a student got wrong.',
  '',
  'You are given only the material below. The recording itself is not attached.',
  'If a transcript line is provided, it is the only part of the recording you',
  'know. If none is provided, say so plainly in the first two fields rather than',
  'inventing what was said — a student who is told the recording said something',
  'it never said has been taught an error.',
  '',
  'Listening mistakes have their own shapes, and naming the right one is the',
  'point of the exercise. Consider: a distractor said before the answer; a',
  'speaker who corrected themselves ("half past two — no, sorry, half past',
  'three"); a paraphrase that was not recognised; a number, date or spelling',
  'written in a form the answer key does not accept; an answer over the word',
  'limit; a student still writing the previous answer when this one was said.',
  'Name the one that fits this question, not a list of possibilities.',
  '',
  'Write for a student at roughly band 6. Be concrete and specific to this',
  'question. Two or three sentences per field. No preamble, no encouragement,',
  'no restating the question back.',
].join('\n');

/** What a student sees when Google is over capacity. Not their failure. */
const BUSY_MESSAGE =
  'The explanation service is busy right now. Nothing has been lost. Try again in a moment.';

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

function answerToText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

/** mm:ss, the way the results page prints a moment in the recording. */
function atClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

interface TranscriptMarker {
  time_seconds: number;
  text: string;
}

/**
 * The stored transcript line, or null.
 *
 * Only the marker the content itself carries is accepted. There is no fallback
 * that searches for the answer text the way the reading analyser searches
 * paragraphs, because there is nothing to search: a listening section stores
 * markers, not a transcript.
 */
function readMarker(evidence: unknown): TranscriptMarker | null {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) return null;
  const record = evidence as Record<string, unknown>;
  if (record.kind !== 'transcript') return null;
  if (typeof record.time_seconds !== 'number') return null;
  const text = String(record.text ?? '').trim();
  if (text === '') return null;
  return { time_seconds: record.time_seconds, text };
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
    .select('ordinal, type, prompt, evidence, question_groups!inner(instructions, section_id)')
    .eq('id', mistake.question_id)
    .single();
  if (questionError) return json({ error: questionError.message }, 500);

  const group = question.question_groups as unknown as {
    instructions: string | null;
    section_id: string;
  };
  const { data: section, error: sectionError } = await admin
    .from('sections')
    .select('ordinal, kind, stimulus')
    .eq('id', group.section_id)
    .single();
  if (sectionError) return json({ error: sectionError.message }, 500);

  // A reading question asked of the listening analyser would be explained from
  // a transcript that does not exist. Refuse it rather than answer it wrongly.
  if (section.kind !== 'listening') {
    return json({ error: 'That question is not from a listening section.' }, 400);
  }

  const stimulus = section.stimulus as { title?: string };
  const marker = readMarker(question.evidence);

  const payload = {
    prompt_version: PROMPT_VERSION,
    question_number: question.ordinal,
    question_type: question.type,
    question: question.prompt,
    instructions: group.instructions,
    user_answer: answerToText(mistake.user_answer),
    correct_answer: answerToText(mistake.correct_answer),
    time_spent_seconds: mistake.time_spent_seconds,
    section_number: section.ordinal,
    section_title: typeof stimulus.title === 'string' ? stimulus.title : null,
    // One line at most, and only the one the content itself recorded.
    transcript_excerpt: marker
      ? { at: atClock(marker.time_seconds), text: marker.text }
      : null,
    transcript_excerpt_basis: marker
      ? 'the timestamp recorded with this question'
      : 'no transcript line is stored for this question',
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
