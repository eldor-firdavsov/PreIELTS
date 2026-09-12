/**
 * scripts/env.ts — put .env.local on process.env for the server-side scripts.
 *
 * `.env.example` documents SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL as the
 * variables `scripts/upload-audio.ts` and `scripts/seed.ts` read, and Vite
 * loads `.env.local` for the browser half, so both halves of the project look
 * as though they are configured from the same file. They were not: tsx does
 * not read an env file, so the scripts saw only what the shell exported. A key
 * sitting in `.env.local` produced "SUPABASE_SERVICE_ROLE_KEY must be set",
 * which is a confusing thing to be told about a file you have just filled in.
 *
 * Reads `.env.local` first and `.env` second, the same precedence Vite uses. A
 * variable already present in the environment always wins, so exporting one for
 * a single command still overrides the file. A missing file is not an error:
 * the shell is a perfectly good way to supply these, and is the right way in
 * CI.
 *
 * Deliberately not a dependency. Nothing here is worth a package, and a script
 * that reads credentials should be short enough to read in full.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The files consulted, in precedence order. */
const FILES = ['.env.local', '.env'] as const;

/**
 * One `KEY=value` line, or null for a blank line or a comment.
 *
 * Surrounding quotes are stripped because a secret pasted from a dashboard is
 * often quoted, and a service-role key with a stray `"` on each end fails in a
 * way that names neither the quote nor the file.
 */
function parseLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return null;

  const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
  const separator = withoutExport.indexOf('=');
  if (separator <= 0) return null;

  const key = withoutExport.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = withoutExport.slice(separator + 1).trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

/**
 * Load the env files into process.env, without overwriting what is already set.
 * Safe to call more than once; the second call finds everything already there.
 */
export function loadEnvFiles(): void {
  for (const file of FILES) {
    const path = resolve(file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const entry = parseLine(line);
      if (!entry) continue;
      const [key, value] = entry;
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
