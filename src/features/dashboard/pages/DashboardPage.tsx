import { Link } from 'react-router-dom';
import { cn } from '../../../lib/utils/cn.ts';
import {
  Card, ErrorState, Skeleton, SkeletonRegion, errorMessage,
} from '../../../design-system/index.ts';
import { formatBand, formatDate } from '../../../lib/utils/format.ts';
import { useDashboard, useNextAction } from '../hooks/useDashboard.ts';
import { SKILL_ORDER, type SkillStanding } from '../services/dashboardService.ts';

const SKILL_LABEL: Record<string, string> = {
  listening: 'Listening', reading: 'Reading',
};

/**
 * Where the student is, across both skills.
 *
 * A skill never sat shows an em dash and an invitation, not a zero. A zero is a
 * band, and claiming one the student did not earn is the fastest way to make
 * every other number here untrustworthy.
 */
export default function DashboardPage() {
  const dashboard = useDashboard();
  const nextAction = useNextAction();

  if (dashboard.error) {
    return (
      <ErrorState
        title="We could not load your band estimates"
        description={errorMessage(dashboard.error)}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const data = dashboard.data;
  const loading = dashboard.isLoading;
  const untested = data ? data.skills.every((skill) => skill.band === null) : false;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-ink sm:text-[31px]">
          {loading ? 'Dashboard' : data?.fullName ? `Hello, ${data.fullName}` : 'Dashboard'}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your current estimated band, recent activity and what to work on next.
        </p>
      </div>

      {/* ------------------------------------------------- band per skill */}
      <section className="glass-panel overflow-hidden rounded-2xl shadow-lift">
        <div className="flex items-baseline justify-between gap-3 border-b border-glass-bd px-4 py-3.5 sm:px-5">
          <h2 className="font-heading text-lg font-bold text-ink sm:text-[20px]">Estimated band by skill</h2>
          {!loading && data?.targetBand !== null && data?.targetBand !== undefined && (
            <span className="text-xs text-ink-muted sm:text-[13px]">
              {`Target ${formatBand(data.targetBand)}`}
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            aria-label="Loading band estimates"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 sm:p-4"
          >
            <div className="rounded-xl border border-glass-bd/80 bg-surface/50 backdrop-blur-md p-4 sm:p-5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2.5 h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
            <div className="rounded-xl border border-glass-bd/80 bg-surface/50 backdrop-blur-md p-4 sm:p-5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-2.5 h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 sm:p-4">
            {SKILL_ORDER.map((kind) => {
              const skill = data?.skills.find((s) => s.kind === kind);
              const hasBand = skill?.band !== null && skill?.band !== undefined;
              return (
                <div
                  key={kind}
                  className="rounded-xl border border-glass-bd/80 bg-surface/55 backdrop-blur-md p-4 sm:p-5 transition-all duration-200 hover:bg-surface/75 hover:shadow-xs"
                >
                  <div className="h6l">{SKILL_LABEL[kind] ?? kind}</div>
                  <div
                    className={cn(
                      'mono font-mono text-2xl font-extrabold leading-[1] sm:text-[31px] mt-1.5',
                      hasBand ? 'text-ink' : 'text-ink-faint',
                    )}
                  >
                    {hasBand ? formatBand(skill.band) : '—'}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted sm:text-[13px]">
                    {skill ? subtitleFor(skill) : 'Not attempted'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ what to do next */}
      {loading || nextAction.isLoading ? (
        <NextActionSkeleton />
      ) : !untested ? (
        <NextAction action={nextAction.data ?? null} loading={false} />
      ) : (
        <section className="glass-panel rounded-2xl p-6 sm:p-8 shadow-lift">
          <h2 className="text-lg font-semibold text-ink sm:text-[20px]">No results yet</h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-muted">
            Take a paper and it is marked against the answer key the moment you submit. Your estimated band, your mistakes and your timings all appear from that one submission.
          </p>
          <Link
            to="/tests"
            className="mt-3.5 inline-block text-sm font-semibold text-primary hover:underline hover:text-primary-hover"
          >
            Take your first test →
          </Link>
        </section>
      )}

      {/* ---------------------------------------------------- recent work */}
      {(loading || (data && data.recent.length > 0)) && (
        <section className="glass-panel overflow-hidden rounded-2xl shadow-lift">
          <div className="flex items-baseline justify-between gap-3 border-b border-glass-bd px-4 py-3.5 sm:px-5">
            <h2 className="font-heading text-lg font-bold text-ink sm:text-[20px]">Recent tests</h2>
            <Link
              to="/history"
              className="text-xs font-semibold text-primary hover:underline hover:text-primary-hover sm:text-[13px]"
            >
              All results
            </Link>
          </div>
          <div className="px-3 py-1 pb-3 sm:px-4 divide-y divide-glass-bd">
            {loading ? (
              <SkeletonRegion label="Loading your recent tests" className="flex flex-col gap-3 py-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 py-1.5 px-2">
                    <Skeleton className={cn('h-4', i === 0 ? 'w-56' : i === 1 ? 'w-48' : 'w-64')} />
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-3.5 w-16" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                  </div>
                ))}
              </SkeletonRegion>
            ) : (
              data?.recent.map((row) => (
                <div
                  key={row.resultId}
                  className="flex items-baseline gap-3.5 py-3 px-2 rounded-xl sm:gap-4 sm:py-3.5 hover:bg-surface/40 transition-colors"
                >
                  <Link
                    to={`/results/${row.resultId}`}
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-primary hover:underline hover:text-primary-hover"
                  >
                    {row.title}
                  </Link>
                  <span className="shrink-0 text-xs text-ink-muted sm:text-[13px]">
                    {formatDate(row.createdAt)}
                  </span>
                  <span className="mono font-mono w-10 shrink-0 text-right text-sm font-bold text-ink sm:text-base">
                    {formatBand(row.band)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * SPEC.md §4's recommended next action.
 *
 * Poster design with deep crimson background and high contrast white action button.
 */
function NextAction({
  action,
  loading,
}: {
  action: { skill: string; headline: string; detail: string } | null;
  loading: boolean;
}) {
  const SKILL: Record<string, string> = {
    listening: 'Listening', reading: 'Reading',
  };

  if (loading) {
    return (
      <section role="status" aria-label="Loading your recommendation" className="glass-panel rounded-2xl p-5 sm:p-6 shadow-lift">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-3.5 h-3 w-full max-w-xl" />
        <Skeleton className="mt-2 h-3 w-3/4 max-w-md" />
      </section>
    );
  }

  if (!action) {
    return (
      <Card>
        <div className="p-5 sm:p-6">
          <p className="max-w-3xl text-sm leading-6 text-ink-muted">
            {'A recommendation appears here once you have asked for a study plan. '}
            <Link to="/analysis" className="font-semibold text-primary hover:underline hover:text-primary-hover">
              Write one on the Analysis page
            </Link>
            {'.'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-[#2a0c09]/95 via-[#38100c]/90 to-[#1f0806]/95 text-[#fdf6f4] shadow-lift backdrop-blur-2xl">
      <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-primary/20 blur-[70px]" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3 border-b border-[#f7f5f1]/15 px-4 py-3.5 sm:px-5">
        <h2 className="font-heading text-lg font-bold text-[#fdf6f4] sm:text-[20px]">Recommended next action</h2>
        <span className="rounded-pill border border-white/20 bg-white/10 px-3 py-0.5 text-[11px] font-heading font-extrabold uppercase tracking-wider text-[#fdf6f4] backdrop-blur-md">
          {SKILL[action.skill] ?? action.skill}
        </span>
      </div>
      <div className="relative flex flex-col items-start gap-2.5 p-4 sm:p-5 sm:py-5.5">
        <div className="max-w-[36ch] font-heading text-xl font-extrabold tracking-tight text-[#fdf6f4] sm:text-2xl text-balance">
          {action.headline}
        </div>
        <p className="max-w-[68ch] text-sm leading-relaxed text-[#fdf6f4]/85 sm:text-[15px] text-pretty">
          {action.detail}
        </p>
        <Link
          to={`/tests?skill=${action.skill}`}
          className={cn(
            'mt-2 inline-flex min-h-[48px] items-center justify-center rounded-base px-5 py-3',
            'bg-[#fdf6f4] text-sm font-heading font-extrabold text-[#2a0c09] shadow-sm transition-all sm:text-base',
            'hover:bg-white hover:scale-[1.01] active:scale-[0.98]',
          )}
        >
          {`Start a ${SKILL[action.skill]?.toLowerCase() ?? action.skill} test →`}
        </Link>
      </div>
    </section>
  );
}

function NextActionSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading recommendation"
      className="glass-panel overflow-hidden rounded-2xl shadow-lift"
    >
      <div className="flex items-center justify-between gap-3 border-b border-glass-bd px-4 py-3.5 sm:px-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-16 rounded-pill" />
      </div>
      <div className="flex flex-col items-start gap-3 p-4 sm:p-5 sm:py-5.5">
        <Skeleton className="h-7 w-3/4 max-w-md sm:h-8" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-2/3 max-w-lg" />
        <Skeleton className="mt-2 h-12 w-48 rounded-base" />
      </div>
    </section>
  );
}

/** What to say under a band: how it moved, or that the skill is untried. */
function subtitleFor(skill: SkillStanding): string {
  if (skill.band === null) return 'Not attempted';
  if (skill.delta === null) return `First attempt, ${formatDate(skill.recordedAt)}`;
  if (skill.delta === 0) return `No change over ${skill.attempts} attempts`;
  const direction = skill.delta > 0 ? 'up' : 'down';
  return `${direction} ${Math.abs(skill.delta).toFixed(1)} on last attempt`;
}

