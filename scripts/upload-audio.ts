/**
 * scripts/upload-audio.ts — get listening audio into Storage, from either source.
 *
 * Two kinds of paper need the same end state, an object in the private `audio`
 * bucket, and they arrive at it differently:
 *
 *   ingested   content/normalized/<id>.json hotlinks archive.org. The file is
 *              fetched once, uploaded as <external_id>.mp3, and recorded as a
 *              `set_audio_path` operation in content/repairs/<external_id>.json.
 *              Routing the rewrite through the repair overlay keeps ingest pure:
 *              ingest goes on emitting whatever the source says, and the storage
 *              path is applied by scripts/repair.ts with every other correction.
 *
 *   original   content/original/<id>.json already names its bucket path, because
 *              the recording was authored for this product rather than found. Its
 *              master sits in content/audio/, and only the upload is missing. No
 *              overlay is written: nothing about the source file is wrong, so
 *              there is no correction to record, and content/original/ is not
 *              repairable material.
 *
 * So a bucket path in the file is not on its own proof the object exists. It is
 * checked, and a path whose object is missing is repaired from the local master
 * rather than skipped — skipping it is what left a finished listening paper
 * unpublishable, its audio on disk and its test switched off.
 *
 * A failed fetch or upload is fatal for that file. There is no fallback to the
 * original URL: validate.ts rejects any listening section whose audio_url still
 * looks like an external URL, so a silent hotlink cannot reach the database.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key is
 * needed because the bucket is private; it must never reach the browser.
 *
 * Usage:
 *   tsx scripts/upload-audio.ts [external_id ...] [--dry-run] [--force]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { loadEnvFiles } from './env.ts';
import type { NormalizedTest } from '../src/types/content.ts';
import type { RepairFile, SetAudioPathOp } from './repair.ts';

const NORMALIZED_DIR = resolve('content/normalized');
const ORIGINAL_DIR = resolve('content/original');
const LOCAL_AUDIO_DIR = resolve('content/audio');
const REPAIR_DIR = resolve('content/repairs');
const BUCKET = 'audio';

/** The smallest plausible recording. Anything under this is a truncated file. */
const MIN_AUDIO_BYTES = 100_000;

interface Env {
  url: string;
  serviceKey: string;
}

function requireEnv(): Env {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. The bucket is private, ' +
      'so a publishable key cannot write to it.',
    );
  }
  return { url, serviceKey };
}

/** Create the private bucket if it is not there yet. Safe to repeat. */
async function ensureBucket(env: Env): Promise<void> {
  const res = await fetch(`${env.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.serviceKey}`,
      apikey: env.serviceKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (res.ok) {
    console.log(`created private bucket '${BUCKET}'`);
    return;
  }
  const body = await res.text();
  if (res.status === 409 || /already exists/i.test(body)) return;
  throw new Error(`could not ensure bucket '${BUCKET}': ${res.status} ${body}`);
}

async function objectSha(env: Env, key: string): Promise<string | null> {
  const res = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'HEAD',
    headers: { authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey },
  });
  return res.ok ? (res.headers.get('etag') ?? '') : null;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const type = res.headers.get('content-type') ?? '';
  if (!/audio|octet-stream|mpeg/i.test(type)) {
    throw new Error(`unexpected content-type ${JSON.stringify(type)}, refusing to upload`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength < MIN_AUDIO_BYTES) {
    throw new Error(`downloaded only ${bytes.byteLength} bytes, refusing to upload a truncated file`);
  }
  return bytes;
}

/**
 * The local master for an original paper, read from content/audio/ under the
 * basename its bucket path already names, so the object and the path the test
 * carries cannot disagree.
 */
function readLocal(storagePath: string): Buffer {
  const file = join(LOCAL_AUDIO_DIR, basename(storagePath));
  if (!existsSync(file)) {
    throw new Error(
      `bucket path ${storagePath} has no object and no local master at ${file}. ` +
      'The recording has to exist somewhere before the test can be published.',
    );
  }
  const bytes = readFileSync(file);
  if (bytes.byteLength < MIN_AUDIO_BYTES) {
    throw new Error(`${file} is only ${bytes.byteLength} bytes, refusing to upload a truncated file`);
  }
  return bytes;
}

async function upload(env: Env, key: string, bytes: Buffer): Promise<void> {
  const res = await fetch(`${env.url}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.serviceKey}`,
      apikey: env.serviceKey,
      'content-type': 'audio/mpeg',
      'x-upsert': 'true',
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
}

/**
 * Where a test's content is read from. Deliberately not validate.ts's resolver:
 * that one prefers the repaired file, which is this script's own output, and
 * reading it back would hide the hotlink still sitting in the ingested source.
 */
function resolveTestFile(id: string): string | null {
  const normalized = join(NORMALIZED_DIR, `${id}.json`);
  if (existsSync(normalized)) return normalized;
  const original = join(ORIGINAL_DIR, `${id}.json`);
  if (existsSync(original)) return original;
  return null;
}

/** Every id on disk, ingested and original alike. */
function listIds(): string[] {
  const ids = new Set<string>();
  for (const dir of [NORMALIZED_DIR, ORIGINAL_DIR]) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json')) ids.add(file.replace(/\.json$/, ''));
    }
  }
  return [...ids].sort();
}

/** Merge a set_audio_path operation into the test's repair overlay. */
function recordOperation(externalId: string, op: SetAudioPathOp): void {
  mkdirSync(REPAIR_DIR, { recursive: true });
  const path = join(REPAIR_DIR, `${externalId}.json`);
  const repair: RepairFile = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as RepairFile)
    : { external_id: externalId, description: 'Generated by scripts/upload-audio.ts.', operations: [] };

  const at = repair.operations.findIndex((o) => o.op === 'set_audio_path');
  if (at >= 0) repair.operations[at] = op;
  else repair.operations.push(op);
  writeFileSync(path, `${JSON.stringify(repair, null, 2)}\n`);
}

async function main(): Promise<void> {
  // Credentials may live in .env.local, which tsx does not read on its own.
  loadEnvFiles();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const targets = args.filter((a) => !a.startsWith('--'));

  const ids = targets.length > 0 ? targets : listIds();

  const env = dryRun ? null : requireEnv();
  if (env) await ensureBucket(env);

  let uploaded = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const id of ids) {
    const file = resolveTestFile(id);
    if (!file) {
      failures.push(`${id}: no content file in content/normalized/ or content/original/`);
      continue;
    }
    const test = JSON.parse(readFileSync(file, 'utf8')) as NormalizedTest;
    const audio = test.sections.find((s) => s.stimulus.type === 'audio');
    if (!audio || audio.stimulus.type !== 'audio') continue;

    const source = audio.stimulus.audio_url;
    if (!source) {
      failures.push(`${id}: listening test has no audio URL in the source file, nothing to upload`);
      continue;
    }
    const hotlinked = /^https?:/i.test(source);

    // An ingested paper is stored under its id; an original one already names
    // its own object, and that name is authoritative.
    const key = hotlinked ? `${id}.mp3` : basename(source);

    if (dryRun) {
      const local = join(LOCAL_AUDIO_DIR, basename(source));
      if (hotlinked) console.log(`${id}: would fetch ${source} -> ${BUCKET}/${key}`);
      else if (existsSync(local)) {
        const mb = (statSync(local).size / 1048576).toFixed(1);
        console.log(`${id}: bucket path ${source}, would upload local master (${mb} MB) if absent`);
      } else console.log(`${id}: bucket path ${source}, no local master to fall back on`);
      continue;
    }

    try {
      const present = (await objectSha(env!, key)) !== null;

      if (!hotlinked) {
        // Already pointing at the bucket. The only question is whether the
        // object is actually there.
        if (present && !force) {
          skipped++;
          console.log(`${id}: already in bucket at ${source}`);
        } else {
          process.stdout.write(`${id}: ${present ? 're-uploading' : 'object missing, uploading'} local master...`);
          const bytes = readLocal(source);
          await upload(env!, key, bytes);
          console.log(` ${(bytes.byteLength / 1048576).toFixed(1)} MB, done`);
          uploaded++;
        }
        continue;
      }

      if (!force && present) {
        console.log(`${id}: object already in bucket, re-recording overlay only`);
      } else {
        process.stdout.write(`${id}: fetching...`);
        const bytes = await download(source);
        process.stdout.write(` ${(bytes.byteLength / 1048576).toFixed(1)} MB, uploading...`);
        await upload(env!, key, bytes);
        console.log(' done');
        uploaded++;
      }
      const digest = createHash('sha256');
      // Hash from the stored object so the recorded digest describes what is
      // actually in the bucket, not what we happened to hold in memory.
      const stored = await fetch(`${env!.url}/storage/v1/object/${BUCKET}/${key}`, {
        headers: { authorization: `Bearer ${env!.serviceKey}`, apikey: env!.serviceKey },
      });
      if (!stored.ok) throw new Error(`could not read back ${key}: ${stored.status}`);
      digest.update(Buffer.from(await stored.arrayBuffer()));

      recordOperation(id, {
        op: 'set_audio_path',
        path: `${BUCKET}/${key}`,
        source_url: source,
        sha256: digest.digest('hex'),
        reason: `Audio was hotlinked from ${new URL(source).host}. Fetched once and stored in the private '${BUCKET}' bucket so the platform does not depend on a third-party host.`,
      });
    } catch (err) {
      failures.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nuploaded ${uploaded}, already stored ${skipped}, failed ${failures.length}`);
  for (const f of failures) console.error(`  FAILED ${f}`);
  if (failures.length > 0) {
    console.error('\nNot falling back to the original URLs. Fix the failures and re-run.');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
