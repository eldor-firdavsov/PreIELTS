import { Link, useParams } from 'react-router-dom';
import { Card, EmptyState, ErrorState, SkeletonLines, errorMessage } from '../../../design-system/index.ts';
import { formatDate } from '../../../lib/utils/format.ts';
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
    return (
      <div className="w-full py-8">
        <SkeletonLines lines={8} />
      </div>
    );
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
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[31px]">{overview.test_title}</h1>
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
