/**
 * scripts/seed.ts — upsert normalized content into Supabase.
 *
 * Reads content/normalized-repaired/<id>.json where an overlay exists,
 * content/normalized/<id>.json next, and content/original/<id>.json last, so a
 * repaired test is always seeded in its repaired form. The resolution order
 * lives in validate.ts and is imported, so validate and seed can never disagree
 * about which bytes are the test.
 *
 * Every test is written by one call to the seed_test(jsonb) function from
 * migration 0003. A function call is a transaction by definition, so a test
 * lands whole or not at all, and the same guarantee holds over either
 * transport. That is also why the upsert logic lives in SQL rather than here:
 * one implementation, not two that can drift.
 *
 * Idempotency comes from tests.external_id, derived from the raw filename and
 * never changing. seed_test guards every DO UPDATE with IS DISTINCT FROM, so a
 * second run over unchanged input rewrites no rows at all. `--verify` asserts
 * that and exits non-zero if anything changed.
 *
 * Transport is chosen from the environment:
 *   DATABASE_URL                                direct Postgres
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY    PostgREST rpc
 *
 * Usage:
 *   tsx scripts/seed.ts [external_id ...] [--allow-invalid] [--verify]
 *                       [--dry-run] [--emit-sql <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadEnvFiles } from './env.ts';
import { validateTest, resolveContent, listContentIds } from './validate.ts';
import type { ContentSource } from './validate.ts';
import type { NormalizedTest } from '../src/types/content.ts';

export interface TableCounts { inserted: number; updated: number; deleted: number }
export interface SeedCounts {
  tests: TableCounts;
  sections: TableCounts;
  question_groups: TableCounts;
  questions: TableCounts;
}

const TABLES = ['tests', 'sections', 'question_groups', 'questions'] as const;

function emptyCounts(): SeedCounts {
  return {
    tests: { inserted: 0, updated: 0, deleted: 0 },
    sections: { inserted: 0, updated: 0, deleted: 0 },
    question_groups: { inserted: 0, updated: 0, deleted: 0 },
    questions: { inserted: 0, updated: 0, deleted: 0 },
  };
}

function add(into: SeedCounts, from: SeedCounts): void {
  for (const table of TABLES) {
    into[table].inserted += from[table].inserted;
    into[table].updated += from[table].updated;
    into[table].deleted += from[table].deleted;
  }
}

export function totalChanges(counts: SeedCounts): number {
  return TABLES.reduce((n, t) => n + counts[t].inserted + counts[t].updated + counts[t].deleted, 0);
}

/** Direct Postgres. seed_test is itself atomic; the explicit transaction just
 *  makes the boundary obvious to anyone reading a query log. */
async function seedViaPostgres(client: pg.PoolClient, test: NormalizedTest): Promise<SeedCounts> {
  await client.query('begin');
  try {
    const res = await client.query<{ seed_test: SeedCounts }>('select seed_test($1::jsonb)', [JSON.stringify(test)]);
    await client.query('commit');
    return res.rows[0]!.seed_test;
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
}

/** PostgREST. One HTTP call is one transaction, which is the whole point. */
async function seedViaRest(url: string, serviceKey: string, test: NormalizedTest): Promise<SeedCounts> {
  const res = await fetch(`${url}/rest/v1/rpc/seed_test`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ payload: test }),
  });
  if (!res.ok) throw new Error(`rpc failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as SeedCounts;
}

function loadTest(id: string): { test: NormalizedTest; source: ContentSource } {
  const found = resolveContent(id);
  if (!found) throw new Error(`no normalized file for ${id}`);
  return { test: JSON.parse(readFileSync(found.path, 'utf8')) as NormalizedTest, source: found.source };
}

/** Dollar-quote the payload so the emitted file needs no escaping rules. */
function dollarQuote(text: string): string {
  let tag = 'seed';
  while (text.includes(`$${tag}$`)) tag += 'x';
  return `$${tag}$${text}$${tag}$`;
}

async function main(): Promise<void> {
  // Credentials may live in .env.local, which tsx does not read on its own.
  loadEnvFiles();

  const args = process.argv.slice(2);
  const allowInvalid = args.includes('--allow-invalid');
  const verify = args.includes('--verify');
  const dryRun = args.includes('--dry-run');
  const emitIndex = args.indexOf('--emit-sql');
  const emitPath = emitIndex >= 0 ? args[emitIndex + 1] : null;
  const targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--emit-sql');

  const ids = targets.length > 0 ? targets : listContentIds();

  // ---- validate before touching anything ---------------------------------
  //
  // A bad file is dropped from the batch; it does not take the batch with it.
  //
  // This used to abort the whole run on the first offender, and the cost was
  // not theoretical: three third-party listening papers still hotlink
  // archive.org, so `npm run seed` refused every one of the tests on disk,
  // including the papers that have no audio at all and were therefore missing
  // from the product entirely. One file's problem is not another file's
  // problem.
  //
  // The guarantee that matters is unchanged and is now enforced per test
  // rather than per run: a hotlinked paper never reaches the database, and
  // --allow-invalid still cannot wave one through. Anything skipped is named,
  // and the run still exits non-zero so this stays loud in CI.
  const seenIds = new Set<string>();
  const invalid = new Map<string, string>();
  const hotlinked = new Map<string, string>();
  for (const id of ids) {
    const { test, source } = loadTest(id);
    const { errors } = validateTest(test, seenIds, source);
    // Hotlinked third-party audio is the one failure --allow-invalid cannot
    // wave through. Seeding it would leave playback at the mercy of someone
    // else's server and serve content we have no right to serve.
    const external = errors.filter((e) => e.includes('still an external URL'));
    if (external.length > 0) hotlinked.set(id, external[0]!);
    else if (errors.length > 0) {
      invalid.set(id, `${errors.length} errors, first is "${errors[0]}"`);
    }
  }

  const skipped = new Map<string, string>(hotlinked);
  if (!allowInvalid) for (const [id, why] of invalid) skipped.set(id, why);

  if (hotlinked.size > 0) {
    console.error(`Skipping ${hotlinked.size} test${hotlinked.size === 1 ? '' : 's'} whose audio is still hotlinked. Run scripts/upload-audio.ts first.`);
    for (const [id, why] of hotlinked) console.error(`  ${id}: ${why}`);
    console.error('  --allow-invalid does not override this check.\n');
  }
  if (invalid.size > 0 && !allowInvalid) {
    console.error(`Skipping ${invalid.size} test${invalid.size === 1 ? '' : 's'} that fail validation:`);
    for (const [id, why] of invalid) console.error(`  ${id}: ${why}`);
    console.error('  Fix them, or re-run with --allow-invalid to seed them anyway.\n');
  }
  if (invalid.size > 0 && allowInvalid) {
    console.warn(`Seeding ${invalid.size} files that fail validation because --allow-invalid was given.\n`);
  }

  const seedable = ids.filter((id) => !skipped.has(id));
  if (seedable.length === 0) {
    console.error('Nothing left to seed.');
    process.exitCode = 1;
    return;
  }
  // Anything skipped is still a failure of the run, whatever else succeeded.
  if (skipped.size > 0) process.exitCode = 1;

  if (emitPath) {
    const chunks = [
      '-- Generated by scripts/seed.ts --emit-sql. Do not edit.',
      '-- Each statement is one call to seed_test(), and therefore one transaction.',
    ];
    for (const id of seedable) {
      const { test, source } = loadTest(id);
      chunks.push(`\n-- ${id} (${source})`, `select seed_test(${dollarQuote(JSON.stringify(test))}::jsonb);`);
    }
    writeFileSync(resolve(emitPath), `${chunks.join('\n')}\n`);
    console.log(`wrote ${ids.length} seed_test calls to ${emitPath}`);
    return;
  }

  if (dryRun) {
    for (const id of seedable) {
      const { test, source } = loadTest(id);
      const questions = test.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.questions.length, 0), 0);
      console.log(`${id} [${source}] ${test.sections.length} sections, ${questions} questions`);
    }
    return;
  }

  // ---- transport ----------------------------------------------------------
  const connectionString = process.env.DATABASE_URL;
  const restUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!connectionString && !(restUrl && serviceKey)) {
    throw new Error('Set DATABASE_URL, or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const transport = connectionString ? 'postgres' : 'postgrest';
  console.log(`transport: ${transport}\n`);

  const pool = connectionString ? new pg.Pool({ connectionString, max: 1 }) : null;
  const totals = emptyCounts();
  const failures: string[] = [];

  try {
    for (const id of seedable) {
      const { test, source } = loadTest(id);
      try {
        let counts: SeedCounts;
        if (pool) {
          const client = await pool.connect();
          try {
            counts = await seedViaPostgres(client, test);
          } finally {
            client.release();
          }
        } else {
          counts = await seedViaRest(restUrl!, serviceKey!, test);
        }
        add(totals, counts);
        const changed = totalChanges(counts);
        console.log(`${id} [${source}] ${changed === 0 ? 'unchanged' : `${changed} row changes`}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${id}: ${message}`);
        console.error(`${id} ROLLED BACK: ${message}`);
      }
    }
  } finally {
    await pool?.end();
  }

  console.log('\nrow changes by table');
  console.log('table            inserted  updated  deleted');
  console.log('---------------  --------  -------  -------');
  for (const table of TABLES) {
    const c = totals[table];
    console.log(`${table.padEnd(15)}  ${String(c.inserted).padStart(8)}  ${String(c.updated).padStart(7)}  ${String(c.deleted).padStart(7)}`);
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} tests rolled back:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
    return;
  }
  if (verify && totalChanges(totals) !== 0) {
    console.error(`\n--verify FAILED: expected zero row changes, got ${totalChanges(totals)}`);
    process.exitCode = 1;
  } else if (verify) {
    console.log('\n--verify passed: zero row changes');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
