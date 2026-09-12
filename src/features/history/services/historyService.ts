import { supabase } from '../../../lib/supabase/client.ts';
import type { Tables } from '../../../lib/supabase/types.generated.ts';

/**
 * Every result the student has, newest first.
 *
 * `result_overview` is owner-scoped by its own filter, so there is no user
 * predicate here and there must not be one: adding a second filter would
 * suggest the view's is optional.
 */
export type HistoryRow = Tables<'result_overview'> & { kinds: string[] };

export async function listResults(): Promise<HistoryRow[]> {
  const { data, error } = await supabase
    .from('result_overview')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Which skills each paper covered. The overview does not record it, and a
  // band with no skill beside it is close to meaningless.
  const ids = rows.map((row) => row.result_id).filter((id): id is string => id !== null);
  const { data: bands, error: bandError } = await supabase
    .from('result_skill_bands')
    .select('result_id, kind')
    .in('result_id', ids);
  if (bandError) throw new Error(bandError.message);

  const byResult = new Map<string, string[]>();
  for (const row of bands ?? []) {
    if (!row.result_id || !row.kind) continue;
    byResult.set(row.result_id, [...(byResult.get(row.result_id) ?? []), row.kind]);
  }
  return rows.map((row) => ({
    ...row,
    kinds: row.result_id ? (byResult.get(row.result_id) ?? []) : [],
  }));
}
