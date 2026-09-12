import { useState } from 'react';
import {
  Chart, Select, Table,
  type ChartPoint, type Column,
} from '../../../design-system/index.ts';
import { formatDate } from '../../../lib/utils/format.ts';
import { useAnalysis } from '../hooks/useAnalysis.ts';
import { StudyPlanCard } from '../components/StudyPlanCard.tsx';
import { MIN_ATTEMPTS_TO_RANK, type TypeWeakness } from '../services/analysisService.ts';

const SKILL_LABEL: Record<string, string> = {
  listening: 'Listening', reading: 'Reading',
};

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Multiple choice',
  multi_select: 'Multiple answers',
  true_false_not_given: 'True / False / Not Given',
  yes_no_not_given: 'Yes / No / Not Given',
  matching_headings: 'Matching headings',
  matching_information: 'Matching information',
  sentence_completion: 'Sentence completion',
  summary_completion: 'Summary completion',
  short_answer: 'Short answer',
  form_completion: 'Form completion',
  note_completion: 'Note completion',
  map_labelling: 'Map labelling',
};

/**
 * Progression and recurring weaknesses, over every test the student has sat.
 *
 * A question type attempted only once or twice is not evidence of anything, so
 * those rows are shown but marked, and never ranked as a weakness. Telling a
 * student their worst area is one they answered twice would send them to
 * practise the wrong thing.
 *
 * The plan sits at the top because it is the answer to the question the page
 * exists to ask. The chart and the table below it are the evidence it was
 * written from, and they are readable on their own whether or not a plan has
 * been generated.
 */
export default function AnalysisPage() {
  const analysis = useAnalysis();
  const [skill, setSkill] = useState('reading');

  const points: ChartPoint[] = (analysis.data?.progress ?? [])
    .filter((row) => row.kind === skill)
    .map((row) => ({ label: formatDate(row.recordedAt), value: row.band }));

  const columns: Array<Column<TypeWeakness>> = [
    {
      key: 'type',
      header: 'Question type',
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-ink">{TYPE_LABEL[row.questionType] ?? row.questionType}</span>
          {row.total < MIN_ATTEMPTS_TO_RANK && (
            <span className="text-xs text-ink-muted">
              {`Only ${row.total} seen, too few to judge`}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'seen', header: 'Seen', numeric: true, hideBelow: 'sm',
      render: (row) => <span className="numeric">{row.total}</span>,
    },
    {
      key: 'right', header: 'Correct', numeric: true, hideBelow: 'sm',
      render: (row) => <span className="numeric">{row.correct}</span>,
    },
    {
      key: 'pct', header: 'Accuracy', numeric: true,
      render: (row) => (
        <span className={`numeric ${row.total >= MIN_ATTEMPTS_TO_RANK && row.percentCorrect < 60 ? 'text-warn' : 'text-ink'}`}>
          {`${row.percentCorrect}%`}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[31px]">Analysis</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Long-term progression, recurring mistakes and what to improve next.
        </p>
      </div>

      <StudyPlanCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="glass-panel overflow-hidden rounded-2xl shadow-lift">
          <div className="flex items-center justify-between gap-3 border-b border-glass-bd px-4 py-3 sm:px-5">
            <h2 className="text-lg font-semibold text-ink sm:text-[20px]">Band over time</h2>
            <Select
              label="Skill"
              labelHidden
              options={Object.entries(SKILL_LABEL).map(([value, label]) => ({ value, label }))}
              value={skill}
              onChange={(event) => setSkill(event.target.value)}
              loading={analysis.isLoading}
              className="w-36 sm:w-40"
            />
          </div>
          <div className="p-4 sm:p-5">
            <Chart
              points={points}
              loading={analysis.isLoading}
              error={analysis.error}
              onRetry={() => void analysis.refetch()}
              emptyTitle={`No ${SKILL_LABEL[skill]?.toLowerCase() ?? skill} results yet`}
              emptyDescription="A line appears here once you have completed a test in this skill."
            />
          </div>
        </section>

        <section className="glass-panel overflow-hidden rounded-2xl shadow-lift">
          <div className="flex items-baseline justify-between gap-3 border-b border-glass-bd px-4 py-3.5 sm:px-5">
            <h2 className="text-lg font-semibold text-ink sm:text-[20px]">Accuracy by question type</h2>
            {!analysis.isLoading && analysis.data && (
              <span className="text-xs text-ink-muted sm:text-[13px]">
                {`Across ${analysis.data.resultsCounted} marked test${analysis.data.resultsCounted === 1 ? '' : 's'}`}
              </span>
            )}
          </div>
          <Table
            columns={columns}
            rows={analysis.data?.weakest ?? []}
            rowKey={(row) => row.questionType}
            loading={analysis.isLoading}
            error={analysis.error}
            onRetry={() => void analysis.refetch()}
            emptyTitle="Not enough data yet"
            emptyDescription="Analysis is built from your own completed tests. It stays empty until there are results to analyse."
          />
        </section>
      </div>
    </div>
  );
}
