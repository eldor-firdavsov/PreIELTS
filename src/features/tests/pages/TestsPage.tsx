import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { listTests, testRoute, type TestSummary } from '../../engine/index.ts';
import { Badge, CardGrid, Skeleton } from '../../../design-system/index.ts';
import { formatDuration } from '../../../lib/utils/format.ts';
import { cn } from '../../../lib/utils/cn.ts';

const readableKind = (kind: string): string => kind.charAt(0).toUpperCase() + kind.slice(1);

const SKILLS = ['listening', 'reading'] as const;

/**
 * The papers a student can sit.
 *
 * Cards rather than a table, because nothing here is a column of figures to
 * compare down. Each row is one thing you either start or do not, and the
 * decision needs more than a table cell holds: which skill, how long it runs,
 * how many parts. A table made the student read across five columns to learn
 * three facts about one paper.
 *
 * A test links to the surface that can actually run it. A listening paper
 * opened on the reading route would render an empty passage pane over audio
 * content, so the route comes from the paper's own sections rather than from an
 * assumption, and a paper no surface can run yet is shown without a link
 * instead of a link that leads somewhere wrong.
 */
export default function TestsPage() {
  const tests = useQuery({ queryKey: ['tests'], queryFn: listTests });

  /*
   * The skill filter arrives from the dashboard's recommendation, so "work on
   * listening" lands on the listening papers rather than on all twenty-six. It
   * lives in the URL so the filtered view is a place a student can return to
   * and share with a teacher, not a state that evaporates on refresh.
   */
  const [params, setParams] = useSearchParams();
  const skill = params.get('skill');
  const active = SKILLS.find((value) => value === skill) ?? null;

  const rows = (tests.data ?? [])
    .filter((row) => active === null || row.kinds.includes(active))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));

  function setSkill(next: string | null) {
    const draft = new URLSearchParams(params);
    if (next === null) draft.delete('skill');
    else draft.set('skill', next);
    setParams(draft, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[31px]">Tests</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Reading and listening papers, marked against the answer key the moment
          you submit.
        </p>
      </div>

      {/* Both skills and an all. Small enough to show every option rather than
          hide them behind a select the student has to open to see. */}
      <div>
        <div className="glass-pill inline-flex items-center gap-1.5 p-1 rounded-pill overflow-x-auto max-w-full" role="group" aria-label="Filter by skill">
          {[{ value: null, label: 'All skills' }, ...SKILLS.map((v) => ({ value: v, label: readableKind(v) }))].map(
            (option) => {
              const selected = active === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSkill(option.value)}
                  className={cn(
                    'shrink-0 rounded-pill px-4 py-1.5 min-h-[34px] text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-[0.97]',
                    selected
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-ink-muted hover:text-ink hover:bg-surface/60',
                  )}
                >
                  {option.label}
                </button>
              );
            },
          )}
        </div>
      </div>

      <CardGrid
        items={rows}
        itemKey={(row) => row.id}
        renderItem={(row) => <TestCard test={row} />}
        loading={tests.isLoading}
        renderSkeleton={() => <TestCardSkeleton />}
        error={tests.error}
        onRetry={() => void tests.refetch()}
        loadingLabel="Loading the available tests"
        emptyTitle={active ? `No ${readableKind(active).toLowerCase()} tests available` : 'No tests available'}
        emptyDescription={
          active
            ? 'No paper in this skill is published, or readable by this account. Try another skill.'
            : 'Nothing is published, and this account is not on the content tester allowlist.'
        }
      />
    </div>
  );
}

function TestCardSkeleton() {
  return (
    <div className="glass-panel flex w-full flex-col rounded-2xl p-5 min-h-[190px] shadow-rest">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-16 rounded-pill" />
      </div>
      <Skeleton className="mt-2.5 h-5 w-3/4" />
      <div className="mt-auto flex items-baseline gap-6 pt-3">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-4 w-8" />
        </div>
      </div>
      <div className="mt-3 border-t border-glass-bd pt-3">
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

function TestCard({ test }: { test: TestSummary }) {
  const route = testRoute(test);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {test.kinds.length === 0 ? (
          <Badge>No sections</Badge>
        ) : (
          test.kinds.map((kind) => (
            <Badge key={kind} tone="primary">
              {readableKind(kind)}
            </Badge>
          ))
        )}
        {test.is_full_mock && <Badge tone="warn">Full mock</Badge>}
      </div>

      <h2
        className={cn(
          'mt-2 text-sm sm:text-base font-semibold leading-snug',
          route ? 'text-ink group-hover:text-primary transition-colors' : 'text-ink',
        )}
      >
        {test.title}
      </h2>

      {/* The two facts that decide whether to start one now. */}
      <dl className="mt-auto flex flex-wrap items-baseline gap-6 pt-3">
        {test.durationSeconds > 0 && (
          <div className="flex flex-col">
            <dt className="lbl">Takes</dt>
            <dd className="mono font-mono font-semibold text-sm sm:text-base text-ink">
              {formatDuration(test.durationSeconds)}
            </dd>
          </div>
        )}
        {test.sectionCount > 0 && (
          <div className="flex flex-col">
            <dt className="lbl">{test.sectionCount === 1 ? 'Part' : 'Parts'}</dt>
            <dd className="mono font-mono font-semibold text-sm sm:text-base text-ink">
              {test.sectionCount}
            </dd>
          </div>
        )}
      </dl>
    </>
  );

  const shell = cn(
    'glass-panel flex w-full flex-col rounded-2xl p-5 min-h-[190px] shadow-rest transition-all duration-200',
  );

  if (!route) {
    return (
      <div className={cn(shell, 'opacity-75')}>
        {body}
        <p className="mt-3 border-t border-glass-bd pt-3 text-xs text-ink-muted sm:text-[13px]">
          No surface can run this paper yet.
        </p>
      </div>
    );
  }

  /*
   * The whole card is the link, so the target is the card rather than four
   * words inside it. That matters most on a phone, where a title-sized tap
   * target is a miss waiting to happen.
   */
  return (
    <Link
      to={route}
      className={cn(
        shell,
        'group hover:border-primary/40 hover:shadow-lift hover:-translate-y-1 active:scale-[0.99]',
      )}
    >
      {body}
      <span className="mt-3 border-t border-glass-bd pt-3 text-xs font-semibold text-primary sm:text-sm group-hover:underline">
        Start this test →
      </span>
    </Link>
  );
}
