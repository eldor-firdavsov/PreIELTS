import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, ErrorState, Skeleton, errorMessage } from '../../../design-system/index.ts';
import { formatDate } from '../../../lib/utils/format.ts';
import { formatTestTitle } from '../../engine/index.ts';
import { useResult } from '../hooks/useResult.ts';
import { ScoreSummary } from '../components/ScoreSummary.tsx';
import { AccuracyBySection, AccuracyByType } from '../components/AccuracyTables.tsx';
import { MistakeCard } from '../components/MistakeCard.tsx';

/**
 * Results — docs/SPEC.md §8 and §9.
 *
 * Rendered entirely from stored rows. The scores, percentages, band, per-type
 * and per-section accuracy, and the time comparison all arrive already computed
 * from the `result_*` views; nothing is recalculated here.
 *
 * One page serves every skill. The views already carry the section kind, so
 * what changes between a reading and a listening result is wording and which
 * review controls a mistake offers, not the shape of the page.
 */
const SKILL_LABEL: Record<string, string> = {
  reading: 'Reading',
  listening: 'Listening',
};

export default function ResultPage() {
  const { resultId = '' } = useParams();
  const result = useResult(resultId);

  if (result.isLoading) {
    return <ResultPageSkeleton />;
  }
  if (result.error) {
    return (
      <ErrorState
        title="This result could not be loaded"
        description={errorMessage(result.error)}
        onRetry={() => void result.refetch()}
      />
    );
  }
  if (!result.data) {
    return (
      <Card>
        <EmptyState title="Result not found" description="It may belong to another account." />
      </Card>
    );
  }

  const { overview, skills, sections, typeAccuracy, mistakes } = result.data;

  // The paper's skill, taken from the rows rather than assumed. A full mock
  // reports every skill it contains.
  const kinds = [...new Set(sections.flatMap((section) => (section.kind ? [section.kind] : [])))];
  const only = kinds.length === 1 ? kinds[0] : null;
  const skillName = only ? (SKILL_LABEL[only] ?? only) : 'Full mock';
  const skill = only ? skills.find((row) => row.kind === only) : undefined;
  const sectionNoun = only === 'listening' ? 'section' : 'passage';

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[31px]">
          {formatTestTitle(overview.test_title, null, only)}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {`${skillName} result, completed ${formatDate(overview.created_at)}`}
        </p>
      </div>

      <ScoreSummary overview={overview} skill={skill} skillName={skillName} />

      <div className="grid gap-5 md:grid-cols-2 sm:gap-6">
        <AccuracyByType rows={typeAccuracy} />
        <AccuracyBySection rows={sections} noun={sectionNoun} />
      </div>

      <section className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg sm:text-[20px] font-semibold text-ink">
            {mistakes.length === 0
              ? 'Every question correct'
              : `${mistakes.length} question${mistakes.length === 1 ? '' : 's'} to review`}
          </h2>
          <Link to="/history" className="text-xs sm:text-[13px] font-semibold text-primary hover:underline hover:text-primary-hover">
            All results
          </Link>
        </div>

        {mistakes.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing to review"
              description="You answered every question correctly on this paper."
            />
          </Card>
        ) : (
          mistakes.map((mistake) => <MistakeCard key={mistake.mistake_id} mistake={mistake} />)
        )}
      </section>
    </div>
  );
}

function ResultPageSkeleton() {
  return (
    <div className="flex flex-col gap-5 sm:gap-6" role="status" aria-busy="true" aria-label="Loading test results">
      <div>
        <Skeleton className="h-8 w-64 sm:w-80" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>

      {/* Score Summary card skeleton */}
      <section className="glass overflow-hidden rounded-lg">
        <div className="flex flex-wrap gap-px bg-border">
          {/* Estimated band */}
          <div className="flex-[1.3_1_210px] bg-surface p-4 sm:p-[18px]">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2.5 h-10 w-16" />
            <Skeleton className="mt-2 h-3 w-36" />
          </div>
          {/* Raw score */}
          <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-8 w-20" />
          </div>
          {/* Percentage */}
          <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-8 w-16" />
          </div>
          {/* Total time */}
          <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2.5 h-8 w-20" />
          </div>
        </div>
      </section>

      {/* Accuracy tables side by side */}
      <div className="grid gap-5 md:grid-cols-2 sm:gap-6">
        <section className="glass overflow-hidden rounded-lg">
          <div className="border-b border-line px-4 py-3.5 sm:px-[18px]">
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="p-4 sm:p-[18px] flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex justify-between items-center py-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </section>

        <section className="glass overflow-hidden rounded-lg">
          <div className="border-b border-line px-4 py-3.5 sm:px-[18px]">
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="p-4 sm:p-[18px] flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex justify-between items-center py-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Review mistakes cards */}
      <section className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="glass rounded-lg p-4 sm:p-5 flex flex-col gap-3.5 shadow-rest">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-12 rounded-base" />
                <Skeleton className="h-5 w-24 rounded-pill" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex gap-2.5 pt-1">
                <Skeleton className="h-9 w-36 rounded-base" />
                <Skeleton className="h-9 w-32 rounded-base" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
