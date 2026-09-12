import { supabase } from '../../../lib/supabase/client.ts';
import type { Tables, Json } from '../../../lib/supabase/types.generated.ts';
import {
  PROMPT_VERSION as READING_PROMPT_VERSION,
  isReadingMistakeAnalysis,
  type ReadingMistakeAnalysis,
} from '../../../lib/ai/reading-analysis.ts';
import {
  PROMPT_VERSION as LISTENING_PROMPT_VERSION,
  isListeningMistakeAnalysis,
  type ListeningMistakeAnalysis,
} from '../../../lib/ai/listening-analysis.ts';
import { aiErrorMessage } from '../../../lib/ai/errors.ts';

/**
 * Reads for the results page, whatever skill the paper was.
 *
 * Every number comes from a view that already computed it. Nothing here sums,
 * averages or converts a band: a result the student sees must be the result the
 * database recorded, not one this file derived a second time.
 */

export type ResultOverview = Tables<'result_overview'>;
export type ResultSkillBand = Tables<'result_skill_bands'>;
export type ResultSection = Tables<'result_sections'>;
export type ResultTypeAccuracy = Tables<'result_type_accuracy'>;
export type ResultMistake = Tables<'result_mistakes'>;

export interface TestResult {
  overview: ResultOverview;
  skills: ResultSkillBand[];
  sections: ResultSection[];
  typeAccuracy: ResultTypeAccuracy[];
  mistakes: ResultMistake[];
}

export async function fetchResult(resultId: string): Promise<TestResult> {
  const [overview, skills, sections, typeAccuracy, mistakes] = await Promise.all([
    supabase.from('result_overview').select('*').eq('result_id', resultId).single(),
    supabase.from('result_skill_bands').select('*').eq('result_id', resultId),
    supabase.from('result_sections').select('*').eq('result_id', resultId).order('section_ordinal'),
    supabase.from('result_type_accuracy').select('*').eq('result_id', resultId).order('question_type'),
    supabase.from('result_mistakes').select('*').eq('result_id', resultId).order('question_ordinal'),
  ]);

  for (const response of [overview, skills, sections, typeAccuracy, mistakes]) {
    if (response.error) throw new Error(response.error.message);
  }

  return {
    overview: overview.data as ResultOverview,
    skills: skills.data ?? [],
    sections: sections.data ?? [],
    typeAccuracy: typeAccuracy.data ?? [],
    mistakes: mistakes.data ?? [],
  };
}

/**
 * The stimulus a mistake belongs to, for the review controls.
 *
 * Fetched separately rather than embedded in the mistakes view so one passage
 * or one recording is loaded once no matter how many of its questions were
 * wrong.
 */
export interface PassageParagraph {
  label: string | null;
  text: string;
}

export type SectionStimulus =
  | { type: 'passage'; paragraphs: PassageParagraph[] }
  | { type: 'audio'; audioPath: string | null }
  | { type: 'none' };

export async function fetchSectionStimulus(sectionId: string): Promise<SectionStimulus> {
  const { data, error } = await supabase
    .from('sections')
    .select('stimulus')
    .eq('id', sectionId)
    .single();
  if (error) throw new Error(error.message);

  const stimulus = data.stimulus as { type?: string; paragraphs?: Json; audio_url?: Json };

  if (stimulus.type === 'passage') {
    const paragraphs = Array.isArray(stimulus.paragraphs)
      ? stimulus.paragraphs
          .filter((p): p is { [k: string]: Json | undefined } => typeof p === 'object' && p !== null && !Array.isArray(p))
          .map((p) => ({
            label: typeof p.label === 'string' ? p.label : null,
            text: String(p.text ?? ''),
          }))
      : [];
    return { type: 'passage', paragraphs };
  }

  if (stimulus.type === 'audio') {
    return {
      type: 'audio',
      audioPath: typeof stimulus.audio_url === 'string' ? stimulus.audio_url : null,
    };
  }

  return { type: 'none' };
}

/**
 * Stored evidence, absent for questions the source never marked.
 *
 * Reading records where in the passage the answer sits; listening records the
 * moment in the recording and the line that was said. Neither is derived at
 * render time: a guessed offset points a student at the wrong sentence, and a
 * guessed timestamp plays them the wrong ten seconds.
 */
export interface PassageEvidence {
  kind: 'passage';
  paragraph_index: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptEvidence {
  kind: 'transcript';
  time_seconds: number;
  text: string;
}

export function readPassageEvidence(evidence: Json | null): PassageEvidence | null {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) return null;
  if (evidence.kind !== 'passage') return null;
  const { paragraph_index, start, end, text } = evidence as Record<string, unknown>;
  if (typeof paragraph_index !== 'number' || typeof start !== 'number' || typeof end !== 'number') return null;
  return { kind: 'passage', paragraph_index, start, end, text: String(text ?? '') };
}

export function readTranscriptEvidence(evidence: Json | null): TranscriptEvidence | null {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) return null;
  if (evidence.kind !== 'transcript') return null;
  const { time_seconds, text } = evidence as Record<string, unknown>;
  if (typeof time_seconds !== 'number') return null;
  return { kind: 'transcript', time_seconds, text: String(text ?? '') };
}

/* ----------------------------------------------------------------- analysis */

/**
 * "Why was I wrong?", for whichever skill the question came from.
 *
 * Reading and listening get different analysers because they have different
 * evidence. Reading reasons from a paragraph the student can go back and
 * re-read; listening reasons from one line that went past once, at a moment on
 * the clock. Sending a listening question to the reading analyser would have it
 * explain the answer from a passage excerpt that does not exist, which is why
 * the button used to be absent on listening rather than wrong.
 *
 * The two differ in their fields, their cache scope and their prompt version,
 * and in nothing else. Everything below is written once and branches on the
 * kind, so a third skill would be a fourth line in ANALYSERS rather than a
 * second copy of this file.
 */
export type MistakeKind = 'reading' | 'listening';

export type MistakeExplanation =
  | { kind: 'reading'; analysis: ReadingMistakeAnalysis }
  | { kind: 'listening'; analysis: ListeningMistakeAnalysis };

const ANALYSERS = {
  reading: {
    scope: 'mistake',
    promptVersion: READING_PROMPT_VERSION,
    functionName: 'ai-analyze-reading',
  },
  listening: {
    scope: 'listening_mistake',
    promptVersion: LISTENING_PROMPT_VERSION,
    functionName: 'ai-analyze-listening',
  },
} as const;

/** The section kinds an explanation is offered for. */
export function analysableKind(sectionKind: string | null): MistakeKind | null {
  return sectionKind === 'reading' || sectionKind === 'listening' ? sectionKind : null;
}

/** Narrows a stored jsonb blob to the shape its own analyser produces. */
function readExplanation(kind: MistakeKind, value: unknown): MistakeExplanation | null {
  if (kind === 'reading') {
    return isReadingMistakeAnalysis(value) ? { kind, analysis: value } : null;
  }
  return isListeningMistakeAnalysis(value) ? { kind, analysis: value } : null;
}

export interface AnalysisResult {
  explanation: MistakeExplanation;
  /** True when it came from ai_analyses rather than a fresh model call. */
  cached: boolean;
}

/** Cached explanation for this mistake at the current prompt version, if any. */
export async function fetchCachedAnalysis(
  mistakeId: string,
  kind: MistakeKind,
): Promise<AnalysisResult | null> {
  const analyser = ANALYSERS[kind];
  const { data, error } = await supabase
    .from('ai_analyses')
    .select('analysis')
    .eq('scope', analyser.scope)
    .eq('subject_id', mistakeId)
    .eq('prompt_version', analyser.promptVersion)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const explanation = readExplanation(kind, data.analysis);
  if (!explanation) {
    throw new Error('The stored analysis does not match the current schema.');
  }
  return { explanation, cached: true };
}

/**
 * Ask the Edge Function for an explanation.
 *
 * The function does its own cache check before calling Gemini, so this is safe
 * to call even when the client-side check missed. The Gemini key never reaches
 * the browser.
 */
export async function requestAnalysis(
  mistakeId: string,
  kind: MistakeKind,
): Promise<AnalysisResult> {
  const analyser = ANALYSERS[kind];
  const { data, error } = await supabase.functions.invoke(analyser.functionName, {
    body: { mistake_id: mistakeId },
  });
  if (error) throw new Error(aiErrorMessage(await readInvokeError(error)));

  const payload = data as { analysis?: unknown; cached?: boolean } | null;
  const explanation = payload ? readExplanation(kind, payload.analysis) : null;
  if (!explanation) {
    throw new Error('The analysis service returned an unexpected response.');
  }
  return { explanation, cached: payload?.cached === true };
}

/**
 * supabase-js reports a non-2xx function response as "Edge Function returned a
 * non-2xx status code" and hides the body, which is where the actual reason
 * lives. Read it, so a student sees "GEMINI_API_KEY is not configured" —
 * which `aiErrorMessage` then rewrites into a sentence addressed to them —
 * rather than a status code that tells them nothing.
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
