import type { ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';
import { Skeleton } from './Skeleton.tsx';
import { EmptyState } from './EmptyState.tsx';
import { ErrorState } from './ErrorState.tsx';

export interface Column<Row> {
  key: string;
  header: string;
  /** Right-align and use tabular figures for anything numeric. */
  numeric?: boolean;
  /**
   * Drop this column on small screens.
   *
   * A five-column table on a 375px phone scrolls sideways, and the column a
   * student came for is rarely the first one. Rather than make them drag the
   * table to find their band, the secondary columns step out of the way and
   * the row still links to the full result.
   */
  hideBelow?: 'sm' | 'md' | 'lg';
  render: (row: Row) => ReactNode;
}

const HIDE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
};

interface TableProps<Row> {
  columns: Array<Column<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}

/**
 * Owns its own loading, error and empty states so no caller has to
 * reimplement the three of them and get one subtly wrong.
 */
export function Table<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  className,
}: TableProps<Row>) {
  if (error) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : 'The list could not be loaded.'}
        onRetry={onRetry}
      />
    );
  }

  return (
    // Announced once while it fills in. The skeleton cells are decoration; a
    // screen reader hearing "Loading" per cell would be worse than silence.
    <div
      className={cn('overflow-x-auto', className)}
      role={loading ? 'status' : undefined}
      aria-busy={loading || undefined}
      aria-label={loading ? 'Loading rows' : undefined}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-[18px] py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted',
                  column.numeric ? 'text-right' : 'text-left',
                  column.hideBelow && HIDE[column.hideBelow],
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 4 }, (_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`} className="border-b border-line">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-3 py-3 sm:px-4', column.hideBelow && HIDE[column.hideBelow])}
                  >
                    <Skeleton
                      className={cn(
                        'h-4',
                        column.numeric
                          ? 'ml-auto w-10'
                          : rowIndex % 3 === 0
                            ? 'w-4/5'
                            : rowIndex % 3 === 1
                              ? 'w-3/5'
                              : 'w-2/3',
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}

          {!loading &&
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line transition-colors last:border-b-0 hover:bg-sunken">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 py-3 text-ink sm:px-4',
                      column.numeric && 'font-mono tabular-nums text-right',
                      column.hideBelow && HIDE[column.hideBelow],
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>

      {!loading && rows.length === 0 && (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      )}
    </div>
  );
}
