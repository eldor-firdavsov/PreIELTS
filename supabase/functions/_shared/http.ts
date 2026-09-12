/**
 * The parts of an Edge Function that have nothing to do with IELTS.
 *
 * Every function in this directory answers a browser, so every one of them
 * needs the same CORS headers, the same JSON envelope and the same last line of
 * defence against an escaping exception. Five copies of that had already been
 * written; this is the one.
 */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** The preflight and the wrong-verb answers, or null when this is a real POST. */
export function guardMethod(request: Request): Response | null {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  return null;
}

/** The request body, or null when it is not JSON. An empty body reads as {}. */
export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.trim() === '') return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Serve a handler, and make its failures readable.
 *
 * An exception that escapes is replaced by the platform with a generic 500 that
 * names neither the cause nor the line, and never reaches the function logs.
 * Catch it, write it where it can be read, and answer with what actually went
 * wrong.
 */
export function serve(handle: (request: Request) => Promise<Response>): void {
  Deno.serve(async (request: Request): Promise<Response> => {
    try {
      return await handle(request);
    } catch (error) {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error('unhandled exception:', detail);
      const first = detail.split('\n')[0] ?? 'unknown error';
      return json({ error: `The function failed with an unhandled error: ${first}` }, 500);
    }
  });
}
