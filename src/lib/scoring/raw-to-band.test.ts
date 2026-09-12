/**
 * Parity between the TypeScript band table and the SQL one.
 *
 * A wrong band destroys trust, and two copies of a lookup table is exactly the
 * shape of bug that survives review. This walks every raw score through both
 * implementations and fails on the first disagreement.
 *
 * Needs DATABASE_URL pointing at a database with 0006_scoring applied. Without
 * it the parity tests are skipped and only the pure-TypeScript checks run, so
 * `npm test` still means something locally.
 *
 *   node --import tsx --test src/lib/scoring/raw-to-band.test.ts
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { rawToBand, scaleToForty, overallBand, type BandKind } from './raw-to-band.ts';

const KINDS: BandKind[] = ['reading', 'listening'];
const connectionString = process.env.DATABASE_URL;

describe('rawToBand, pure', () => {
  test('a perfect paper is band 9 in both skills', () => {
    for (const kind of KINDS) assert.equal(rawToBand(40, 40, kind), 9.0);
  });

  test('zero is band 0, not null', () => {
    for (const kind of KINDS) assert.equal(rawToBand(0, 40, kind), 0.0);
  });

  test('the two skills genuinely differ', () => {
    // 30/40 is band 7 in both, but 26/40 is 6.5 listening and 6.0 reading.
    assert.equal(rawToBand(26, 40, 'listening'), 6.5);
    assert.equal(rawToBand(26, 40, 'reading'), 6.0);
  });

  test('bands never decrease as the raw score rises', () => {
    for (const kind of KINDS) {
      let previous = -1;
      for (let raw = 0; raw <= 40; raw++) {
        const band = rawToBand(raw, 40, kind);
        assert.ok(band !== null);
        assert.ok(band >= previous, `${kind} band fell at raw ${raw}`);
        previous = band;
      }
    }
  });

  test('unusable input is null rather than a guess', () => {
    assert.equal(rawToBand(null, 40, 'reading'), null);
    assert.equal(rawToBand(10, 0, 'reading'), null);
    assert.equal(rawToBand(10, null, 'reading'), null);
  });

  test('scaling to forty rounds half up', () => {
    assert.equal(scaleToForty(40, 40), 40);
    assert.equal(scaleToForty(29, 29), 40);
    // 9/24 is 15 exactly; 10/24 is 16.67 and rounds to 17.
    assert.equal(scaleToForty(9, 24), 15);
    assert.equal(scaleToForty(10, 24), 17);
    // 3/8 scales to 15 exactly, the half-way case.
    assert.equal(scaleToForty(3, 8), 15);
  });

  test('overall band is the mean rounded to the nearest half', () => {
    assert.equal(overallBand([7.0, 6.0]), 6.5);
    assert.equal(overallBand([7.0, 6.5]), 7.0);
    assert.equal(overallBand([]), null);
  });
});

describe('rawToBand, parity with SQL', { skip: connectionString ? false : 'DATABASE_URL is not set' }, () => {
  let pool: pg.Pool;

  before(() => {
    pool = new pg.Pool({ connectionString, max: 1 });
  });
  after(async () => {
    await pool.end();
  });

  async function sqlBand(raw: number | null, total: number | null, kind: BandKind): Promise<number | null> {
    const { rows } = await pool.query<{ band: string | null }>(
      'select raw_to_band($1::integer, $2::integer, $3::section_kind) as band',
      [raw, total, kind],
    );
    const value = rows[0]?.band;
    return value === null || value === undefined ? null : Number(value);
  }

  for (const kind of KINDS) {
    test(`every raw score 0-40 agrees, ${kind}`, async () => {
      for (let raw = 0; raw <= 40; raw++) {
        const ts = rawToBand(raw, 40, kind);
        const sql = await sqlBand(raw, 40, kind);
        assert.equal(sql, ts, `${kind} raw ${raw}/40: SQL ${sql}, TypeScript ${ts}`);
      }
    });
  }

  test('agrees on papers that are not 40 questions long', async () => {
    // The seeded corpus really does contain 29, 36, 37, 38 and 39 question
    // papers, so the scaling path is not hypothetical.
    for (const total of [29, 36, 37, 38, 39, 13, 8, 24]) {
      for (const kind of KINDS) {
        for (let raw = 0; raw <= total; raw++) {
          const ts = rawToBand(raw, total, kind);
          const sql = await sqlBand(raw, total, kind);
          assert.equal(sql, ts, `${kind} raw ${raw}/${total}: SQL ${sql}, TypeScript ${ts}`);
        }
      }
    }
  });

  test('agrees that unusable input is null', async () => {
    assert.equal(await sqlBand(null, 40, 'reading'), rawToBand(null, 40, 'reading'));
    assert.equal(await sqlBand(10, 0, 'reading'), rawToBand(10, 0, 'reading'));
    assert.equal(await sqlBand(10, null, 'reading'), rawToBand(10, null, 'reading'));
  });
});
