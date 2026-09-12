import { Link } from 'react-router-dom';
import { Badge, CardGrid } from '../../../design-system/index.ts';
import { formatBand, formatDate, formatDuration } from '../../../lib/utils/format.ts';
import { cn } from '../../../lib/utils/cn.ts';
import { useHistory } from '../hooks/useHistory.ts';
import type { HistoryRow } from '../services/historyService.ts';

const SKILL_LABEL: Record<string, string> = {
  reading: 'Reading', listening: 'Listening',
};

/**
 * Every completed test, newest first.
 *
 * Cards rather than a table, and the band leads.
 *
 * In the table the band was the third of five columns, set at the same size as
 * the test title and the elapsed time, and on a phone it sat behind a sideways
 * scroll. It is the only number on this page anyone came for. Here it is the
 * largest thing on the card and the first thing the eye lands on, and the
 * figures that qualify it — raw score, time taken — sit under it in the order
 * you would ask for them.
 *
 * `CardGrid` owns the loading, error and empty states, the same way `Table`
 * did, so moving the layout did not quietly drop all three.
 */
export default function HistoryPage() {
  const history = useHistory();

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[31px]">History</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every test you have taken, with scores and timings.
        </p>
      </div>

      <CardGrid
        items={history.data ?? []}
        itemKey={(row) => row.result_id ?? String(row.session_id)}
        renderItem={(row) => <ResultCard row={row} />}
        loading={history.isLoading}
        error={history.error}
        onRetry={() => void history.refetch()}
        loadingLabel="Loading your past results"
        emptyTitle="No test history"
        emptyDescription="Once you complete and submit a test it appears here, with its full result."
        emptyAction={
          <Link to="/tests" className="text-sm font-semibold text-primary hover:underline hover:text-primary-hover">
            Take a test →
          </Link>
        }
      />
    </div>
  );
}

function ResultCard({ row }: { row: HistoryRow }) {
  const band = formatBand(row.overall_band);
  const hasBand = row.overall_band !== null && row.overall_band !== undefined;

  return (
    <Link
      to={`/results/${row.result_id}`}
      className={cn(
        'glass group flex w-full flex-col rounded-lg p-[18px] shadow-rest',
        'transition-[border-color,box-shadow] duration-150',
        'hover:border-line-strong hover:shadow-lift',
      )}
    >
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm sm:text-[15px] font-semibold leading-snug text-ink group-hover:text-primary transition-colors">
            {row.test_title ?? 'Untitled test'}
          </h2>
          <p className="mt-1 text-xs text-ink-muted sm:text-[13px]">{formatDate(row.created_at)}</p>
        </div>

        {/* The number the page exists for. An em dash where there is no band,
            never a zero: a paper that was never marked has no band, and 0.0
            would be a score the student did not earn. */}
        <div className="shrink-0 text-right">
          <div
            className={cn(
              'mono font-mono text-3xl sm:text-[40px] font-semibold leading-[0.95]',
              hasBand ? 'text-ink' : 'text-ink-faint',
            )}
          >
            {band}
          </div>
          <div className="lbl text-right mt-1">Band</div>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
        {row.kinds.length === 0 ? (
          <Badge>—</Badge>
        ) : (
          row.kinds.map((kind) => (
            <Badge key={kind} tone="primary">
              {SKILL_LABEL[kind] ?? kind}
            </Badge>
          ))
        )}
      </div>

      <dl className="mt-auto flex flex-wrap items-baseline gap-6 sm:gap-7 border-t border-line mt-3.5 pt-3">
        <div className="flex flex-col">
          <dt className="lbl">Score</dt>
          <dd className="mono font-mono font-semibold text-sm sm:text-base text-ink">
            {row.raw_total ? `${row.raw_score} / ${row.raw_total}` : '—'}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="lbl">Time</dt>
          <dd className="mono font-mono font-semibold text-sm sm:text-base text-ink">
            {formatDuration(row.total_time_seconds)}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
