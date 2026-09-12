/**
 * Raw score to IELTS band.
 *
 * Pure: no React, no Supabase, no I/O. This is the copy the UI uses to explain
 * a score. The authoritative copy is `raw_to_band()` in SQL, because scoring
 * runs in `score_session()` and never in the browser.
 *
 * The two must agree exactly. `raw-to-band.test.ts` walks every raw score and
 * asserts parity against the database, so a change to one table without the
 * other fails the build rather than quietly handing two different bands to the
 * same student.
 */

export type BandKind = 'reading' | 'listening';

/**
 * Descending [minimum scaled score, band] pairs. Read top down and take the
 * first row the score reaches. Anything below the last row is band 0.
 *
 * These are the published Academic Reading and Listening tables. Keep the
 * shape identical to the CASE ladder in the SQL function: same order, same
 * thresholds, same bands.
 */
const READING: ReadonlyArray<readonly [number, number]> = [
  [39, 9.0], [37, 8.5], [35, 8.0], [33, 7.5], [30, 7.0], [27, 6.5],
  [23, 6.0], [19, 5.5], [15, 5.0], [13, 4.5], [10, 4.0], [8, 3.5],
  [6, 3.0], [4, 2.5], [2, 2.0], [1, 1.0],
];

const LISTENING: ReadonlyArray<readonly [number, number]> = [
  [39, 9.0], [37, 8.5], [35, 8.0], [32, 7.5], [30, 7.0], [26, 6.5],
  [23, 6.0], [18, 5.5], [16, 5.0], [13, 4.5], [11, 4.0], [8, 3.5],
  [6, 3.0], [4, 2.5], [2, 2.0], [1, 1.0],
];

/**
 * Scale a raw score to its 40-question equivalent, rounding half up.
 *
 * Done in integer arithmetic so it cannot drift from Postgres `round()` on
 * exact numerics the way floating-point division would. The published tables
 * assume a 40-question paper; a section with a different count is scaled, and
 * that is what makes the resulting band an estimate.
 */
export function scaleToForty(raw: number, total: number): number {
  return Math.floor((raw * 80 + total) / (total * 2));
}

/** Null when the inputs cannot produce a band, matching the SQL function. */
export function rawToBand(
  raw: number | null | undefined,
  total: number | null | undefined,
  kind: BandKind,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (total === null || total === undefined || total <= 0) return null;

  const scaled = scaleToForty(raw, total);
  const table = kind === 'listening' ? LISTENING : READING;
  for (const [minimum, band] of table) {
    if (scaled >= minimum) return band;
  }
  return 0.0;
}

/** Mean of the per-skill bands, rounded to the nearest half band. */
export function overallBand(bands: ReadonlyArray<number>): number | null {
  if (bands.length === 0) return null;
  const mean = bands.reduce((sum, band) => sum + band, 0) / bands.length;
  return Math.round(mean * 2) / 2;
}
