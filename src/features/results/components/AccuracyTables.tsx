import { Card, CardHeader, CardTitle, CardBody, Table } from '../../../design-system/index.ts';
import type { Column } from '../../../design-system/index.ts';
import { formatDuration } from '../../../lib/utils/format.ts';
import type { ResultSection, ResultTypeAccuracy } from '../services/resultsService.ts';

const readableType = (type: string): string => type.replace(/_/g, ' ');

/** SPEC.md §8: accuracy by question type, across the whole paper. */
export function AccuracyByType({ rows }: { rows: ResultTypeAccuracy[] }) {
  const columns: Array<Column<ResultTypeAccuracy>> = [
    { key: 'type', header: 'Question type', render: (row) => readableType(row.question_type ?? '') },
    {
      key: 'score',
      header: 'Correct',
      numeric: true,
      render: (row) => `${row.correct ?? 0} / ${row.total ?? 0}`,
    },
    {
      key: 'percent',
      header: 'Accuracy',
      numeric: true,
      render: (row) => (row.percent_correct === null ? '—' : `${row.percent_correct}%`),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accuracy by question type</CardTitle>
      </CardHeader>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.question_type ?? ''}
        emptyTitle="No question types recorded"
      />
    </Card>
  );
}

/**
 * SPEC.md §8 and §9: accuracy and time by section.
 *
 * `noun` is what one section is called in this skill — a reading paper has
 * passages, a listening paper has sections — so the same table can label a
 * listening result without pretending it had passages.
 */
export function AccuracyBySection({ rows, noun }: { rows: ResultSection[]; noun: string }) {
  const heading = noun.charAt(0).toUpperCase() + noun.slice(1);

  const columns: Array<Column<ResultSection>> = [
    {
      key: 'section',
      header: heading,
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-medium">{`${heading} ${row.section_ordinal ?? ''}`}</span>
          {row.section_title && <span className="text-xs text-ink-muted">{row.section_title}</span>}
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Correct',
      numeric: true,
      render: (row) => `${row.raw_score ?? 0} / ${row.raw_total ?? 0}`,
    },
    {
      key: 'percent',
      header: 'Accuracy',
      numeric: true,
      render: (row) => (row.percent_correct === null ? '—' : `${row.percent_correct}%`),
    },
    {
      key: 'time',
      hideBelow: 'sm',
      header: 'Time',
      numeric: true,
      render: (row) => formatDuration(row.time_seconds),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{`Accuracy by ${noun}`}</CardTitle>
      </CardHeader>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.section_id ?? ''}
        emptyTitle={`No ${noun}s recorded`}
      />
      <CardBody className="border-t border-line pt-3 text-xs text-ink-muted">
        {`A ${noun} has no band of its own. The paper is scored once, over all 40 questions.`}
      </CardBody>
    </Card>
  );
}
