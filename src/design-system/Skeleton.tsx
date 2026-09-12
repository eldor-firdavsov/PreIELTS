import { cn } from '../lib/utils/cn.ts';

/**
 * The loading placeholder every screen in this app is built from.
 *
 * Three rules it has to hold, and each of them was broken:
 *
 * It has to be visible. It used to paint itself in --bg-subtle, which is the
 * page canvas, so a skeleton outside a Card was the background. It now uses
 * --skeleton, which measures against a surface the way --border does.
 *
 * It has to be announced once. Every block used to be its own `role="status"`
 * with the label "Loading", so a six-line placeholder told a screen reader
 * "Loading" six times. The region is announced once and the blocks inside it
 * are decoration, which is what they are.
 *
 * It has to stop moving for anyone who asks. `prefers-reduced-motion` turns the
 * pulse off and leaves the block, so the state is still legible without the
 * animation carrying it.
 */

/** One placeholder block. Purely visual: the region around it does the announcing. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block rounded-base bg-skeleton',
        'animate-pulse motion-reduce:animate-none',
        className,
      )}
    />
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
