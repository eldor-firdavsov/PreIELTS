import type { ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';

interface EmptyStateProps {
  title: string;
  /** Say what will fill this space and how to make that happen. */
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Shown when a query succeeded and returned nothing. This is the honest
 * placeholder used everywhere a feature is not built yet: it never stands in
 * for data that does not exist.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-start gap-2 px-5 py-7 text-left', className)}>
      <p className="text-lg font-semibold text-ink">{title}</p>
      {description && <p className="max-w-prose text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
