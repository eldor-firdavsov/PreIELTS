import type { ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';
import { Skeleton } from './Skeleton.tsx';
import { EmptyState } from './EmptyState.tsx';
import { ErrorState } from './ErrorState.tsx';

/**
 * A responsive grid of cards, for lists of things rather than rows of figures.
 *
 * The counterpart to `Table`, and it exists for the same reason: it owns its
 * loading, error and empty states so no page reimplements the three and gets
 * one subtly wrong. Moving a list from `Table` to a hand-rolled grid would have
 * quietly dropped all three.
 *
 * Which to use is a question about the content, not about fashion. A table is
 * right when the reader compares values down a column — accuracy by question
 * type, band by section. Cards are right when each row is a thing you act on
 * rather than a number you compare, and when the thing has more to say than
 * fits in a cell. A test and a past result are both of those.
 *
 * Rendered as a list, because that is what it is: a screen reader announces
 * "list, 12 items" and the reader knows how much is ahead of them.
 */

interface CardGridProps<Item> {
  items: Item[];
  itemKey: (item: Item) => string;
  renderItem: (item: Item) => ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** What is arriving, for the announcement while it loads. */
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Placeholder cards to show while loading. */
  skeletonCount?: number;
  /** Custom skeleton renderer that matches the exact shape of the card. */
  renderSkeleton?: (index: number) => ReactNode;
  className?: string;
}

export function CardGrid<Item>({
  items,
  itemKey,
  renderItem,
  loading = false,
  error,
  onRetry,
  loadingLabel = 'Loading',
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  skeletonCount = 6,
  renderSkeleton,
  className,
}: CardGridProps<Item>) {
  if (error) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : 'The list could not be loaded.'}
        onRetry={onRetry}
      />
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="glass-panel rounded-2xl shadow-lift">
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      </div>
    );
  }

  // One column on a phone, and more as the display earns them. The last step
  // is what keeps an ultrawide display from showing three cards and a desert.
  const grid = cn(
    'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
    className,
  );

  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-label={loadingLabel} className={grid}>
        {Array.from({ length: skeletonCount }, (_, i) =>
          renderSkeleton ? (
            <div key={i} className="flex">{renderSkeleton(i)}</div>
          ) : (
            <div
              key={i}
              className="glass-panel flex w-full flex-col rounded-2xl p-5 min-h-[190px] shadow-rest"
            >
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-5 w-16 rounded-pill" />
              </div>
              <Skeleton className="mt-2.5 h-5 w-3/4" />
              <Skeleton className="mt-1.5 h-3.5 w-1/2" />
              <div className="mt-auto flex items-baseline gap-6 pt-3">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-2.5 w-10" />
                  <Skeleton className="h-4 w-12" />
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
          ),
        )}
      </div>
    );
  }

  return (
    <ul className={grid}>
      {items.map((item) => (
        <li key={itemKey(item)} className="flex">
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
