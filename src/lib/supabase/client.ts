import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.generated.ts';

/**
 * The single browser Supabase client.
 *
 * Only files under `features/<name>/services/` may import this. Components and
 * hooks go through a service, so there is one layer that knows the wire format
 * and one place to change when it moves.
 *
 * The publishable key is safe in the browser: every table it can reach is
 * governed by Row Level Security, and `questions` has no select policy at all.
 * The service role key never appears here and is never prefixed with VITE_.
 */
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-key';

if (!url || !publishableKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required. Copy .env.example to .env.local.',
  );
}


export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // Survive a refresh and a closed tab; this is what keeps a student signed in.
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'ieltsiq.auth',
    // No OAuth providers yet, so there is never a session in the URL to detect.
    detectSessionInUrl: false,
  },
});
