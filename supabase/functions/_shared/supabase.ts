/**
 * Two clients, and the rule that separates them.
 *
 * `caller` acts as the signed-in student and is subject to every policy on the
 * database. `admin` bypasses them, and exists because these functions must
 * reach `questions`, which no client may. Every admin read of a student's row is followed by an ownership check
 * against the caller's own id — the JWT decides who you are, never the body of
 * the request.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.115.0';
import { json } from './http.ts';

export interface Env {
  url: string;
  serviceKey: string;
  anonKey: string;
}

/** The three variables every function needs, or null when one is missing. */
export function readEnv(): Env | null {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return null;
  return { url, serviceKey, anonKey };
}

export interface Caller {
  userId: string;
  /** Acts as the student. Use this for anything RLS or a definer view governs. */
  client: SupabaseClient;
}

export type CallerResult = { ok: true; caller: Caller } | { ok: false; response: Response };

/** Who is asking, established from their own JWT and from nothing else. */
export async function identifyCaller(request: Request, env: Env): Promise<CallerResult> {
  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return { ok: false, response: json({ error: 'Not signed in.' }, 401) };
  }

  const client = createClient(env.url, env.anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { ok: false, response: json({ error: 'Not signed in.' }, 401) };
  }
  return { ok: true, caller: { userId: data.user.id, client } };
}

/** The service-role client. Never handed a value that came from the request body. */
export function adminClient(env: Env): SupabaseClient {
  return createClient(env.url, env.serviceKey, { auth: { persistSession: false } });
}

/** The model key, or the message that says the deployment is not finished. */
export function readApiKey(): { ok: true; key: string } | { ok: false; response: Response } {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) {
    return {
      ok: false,
      response: json({ error: 'GEMINI_API_KEY is not configured for this function.' }, 500),
    };
  }
  return { ok: true, key };
}
