/**
 * The one place a model is called.
 *
 * Every AI feature on this platform goes through here, so the retry ladder, the
 * fallback chain and the distinction between "busy" and "refused" are decided
 * once. Five copies of this had already been written and were already drifting
 * in their error wording; a student meeting the same outage on two screens
 * should not be told two different things.
 *
 * The key is read from the function environment and never leaves it. Nothing in
 * this module logs the payload, because payloads carry a student's own work.
 */

/**
 * The models a call may use, best first.
 *
 * A busy model must not become a dead feature, and neither must a retired one.
 * The chain spans four capacity pools — two steered aliases and two pinned
 * versions — so a spike on one does not take the platform's marking with it.
 * Whichever model answers is returned with the result: a score whose producer
 * is unrecorded cannot be audited afterwards.
 *
 * Pinning is what makes this list need maintenance, and it is still right. An
 * alias that silently moves to a new generation would re-band tomorrow's essays
 * differently from today's under the same prompt version, and `ai_analyses`
 * would have no record of why. The aliases are here as the fast path; the
 * pinned entries are what a stored band can be traced to.
 */
export const MODELS = [
  'gemini-flash-latest',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
] as const;

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * What a failed status means for the walk.
 *
 * Three outcomes, not two, and the third is the one that matters. Google
 * retires a model by answering 404 "no longer available to new users" — a
 * permanent no from that model and a perfectly good request. Treating it as
 * fatal is what turned one retired entry in this list into every AI feature on
 * the platform failing at once, silently, for anyone who had not looked. It is
 * a reason to try the next model, never a reason to stop.
 */
type Disposition = 'retry' | 'next-model' | 'stop';

function dispositionFor(status: number): Disposition {
  // Busy, or a transient fault at their end. Same model, in a moment.
  if (status === 408 || status === 429 || status >= 500) return 'retry';
  // This model cannot serve this key at all. Another one may.
  if (status === 404) return 'next-model';
  // 400, 401, 403, 422: the request is wrong, or the key is. Asking again,
  // or asking someone else, cannot make it right.
  return 'stop';
}

/** A capacity spike, as opposed to a request the model refused on its merits. */
function isBusy(status: number): boolean {
  return status === 429 || status === 503;
}

const ATTEMPTS_PER_MODEL = 2;

interface RawResult {
  ok: Response | null;
  model: string;
  status: number;
  detail: string;
}

/**
 * Ask the first model that will answer.
 *
 * Each model gets two attempts with widening, jittered backoff before the next
 * is tried; the jitter keeps simultaneous submissions from retrying in
 * lockstep. The whole ladder is logged when it fails, because "which of the
 * four refused, and why" is the only question worth asking afterwards, and the
 * student is only ever shown the last answer.
 */
async function call(apiKey: string, body: unknown): Promise<RawResult> {
  let last: RawResult = { ok: null, model: MODELS[0], status: 0, detail: 'no request was made' };
  const ladder: string[] = [];

  for (const model of MODELS) {
    let delay = 1_000;
    for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
      const response = await fetch(endpointFor(model), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      });
      if (response.ok) return { ok: response, model, status: response.status, detail: '' };

      // Always drain a failed body, so a retried response leaks no connection.
      const detail = (await response.text()).slice(0, 300);
      last = { ok: null, model, status: response.status, detail };
      ladder.push(`${model} -> ${response.status}`);

      const disposition = dispositionFor(response.status);
      if (disposition === 'stop') {
        console.error('gemini ladder stopped:', ladder.join(', '), detail);
        return last;
      }
      if (disposition === 'next-model') break;
      if (attempt < ATTEMPTS_PER_MODEL - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 500));
        delay *= 2;
      }
    }
  }

  console.error('gemini ladder exhausted:', ladder.join(', '), last.detail);
  return last;
}

/** One part of a request: text, or a media file sent inline. */
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GenerateOptions {
  apiKey: string;
  /** The system instruction. What the model is, and what it may not do. */
  system: string;
  /** The user turn. Structured data, not prose, wherever there is a choice. */
  parts: Part[];
  /** The response schema the model is constrained to. */
  schema: unknown;
  /** Low by default: an examiner who scores the same essay differently twice is not one. */
  temperature?: number;
}

export type GenerateOutcome =
  | { ok: true; parsed: Record<string, unknown>; model: string }
  /** The model is over capacity. Say "later", not "no". */
  | { ok: false; kind: 'busy' }
  /** The request was refused, or the answer was unusable. `detail` says which. */
  | { ok: false; kind: 'refused'; detail: string };

/**
 * Ask for one JSON object matching `schema`.
 *
 * Returns the parsed object, or a reason. The caller decides what to tell the
 * student, because "your essay is saved" and "nothing was lost" are true of
 * different things on different screens.
 */
export async function generateJson(options: GenerateOptions): Promise<GenerateOutcome> {
  let result: RawResult;
  try {
    result = await call(options.apiKey, {
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: 'user', parts: options.parts }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        responseMimeType: 'application/json',
        responseSchema: options.schema,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: 'refused', detail: `the request never completed: ${message}` };
  }

  if (!result.ok) {
    if (isBusy(result.status)) return { ok: false, kind: 'busy' };
    return { ok: false, kind: 'refused', detail: result.detail || `status ${result.status}` };
  }

  let text: unknown;
  try {
    const body = await result.ok.json();
    text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: 'refused', detail: `the response was not readable: ${message}` };
  }
  if (typeof text !== 'string') {
    return { ok: false, kind: 'refused', detail: 'the model returned no usable content' };
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, kind: 'refused', detail: 'the model returned something other than an object' };
    }
    return { ok: true, parsed: parsed as Record<string, unknown>, model: result.model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: 'refused', detail: `the response was not valid JSON: ${message}` };
  }
}
