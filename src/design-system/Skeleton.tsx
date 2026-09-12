import { cn } from '../lib/utils/cn.ts';

/**
 * The loading placeholder every screen in this app is built from.
 *
 * Three rules it has to hold:
 * 1. It has to be visible: Uses --skeleton which contrasts against any surface.
 * 2. It has to be announced once: Handled by SkeletonRegion with role="status".
 * 3. It respects prefers-reduced-motion: Animations disable smoothly for accessibility.
 */

interface SkeletonProps {
  className?: string;
  /** Use modern shimmer wave animation instead of standard opacity pulse. Defaults to true. */
  shimmer?: boolean;
}

/** One placeholder block. Purely visual: the region around it does the announcing. */
export function Skeleton({ className, shimmer = true }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block rounded-base bg-skeleton',
        shimmer
          ? 'shimmer motion-reduce:after:hidden motion-reduce:animate-none'
          : 'animate-pulse motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/** Pill-shaped badge placeholder (e.g. for section kind, skill, or status tags). */
export function SkeletonBadge({ className }: { className?: string }) {
  return <Skeleton className={cn('h-5 w-16 rounded-pill', className)} />;
}

/** Stat pair placeholder (e.g. "Takes 30m" or "Score 32 / 40"). */
export function SkeletonStat({
  labelWidth = 'w-10',
  valueWidth = 'w-14',
  className,
}: {
  labelWidth?: string;
  valueWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Skeleton className={cn('h-2.5', labelWidth)} />
      <Skeleton className={cn('h-4', valueWidth)} />
    </div>
  );
}

/**
 * A region that is waiting, announced once.
 *
 * Wrap any group of placeholder blocks in this rather than letting each block
 * announce itself. `label` says what is on its way, because "Loading" tells a
 * student nothing they did not already know from the wait.
 */
export function SkeletonRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** Several stacked lines, for paragraph-shaped loading states. */
export function SkeletonLines({
  lines = 3,
  label = 'Loading',
  className,
}: {
  lines?: number;
  /** What is arriving. Shown to assistive tech only. */
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonRegion label={label} className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 && 'w-2/3')} />
      ))}
    </SkeletonRegion>
  );
}
