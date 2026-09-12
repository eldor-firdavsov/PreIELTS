import { cn } from '../lib/utils/cn.ts';

/**
 * A determinate progress bar, for waits where the work has countable steps.
 *
 * Used where a spinner would be a worse answer to the question the student is
 * actually asking, which is not "is it working" but "how much longer". Marking
 * a submit that runs several model calls takes a while; a bar that moves
 * after each part says the wait is finite, and a spinner does not.
 *
 * Two deliberate choices.
 *
 * The first step is never zero. `step` is 1-based, so being on step 1 of 3
 * reads as a third of the way in, not as nothing having happened. Work has
 * happened — the request is out — and a bar pinned at the far left while the
 * first and slowest step runs reads as a stall. This is the goal-gradient
 * effect and it is honest here because the step really is under way; it would
 * not be honest on a bar that had not started.
 *
 * It is brand-coloured, and that is the one place a filled accent bar earns its
 * keep: this is the single thing on the screen the student is waiting on. The
 * track stays neutral so the fill is the only saturated element in view.
 */
export function ProgressBar({
  step,
  total,
  label,
  className,
}: {
  /** 1-based: the step now running, not the count of finished ones. */
  step: number;
  total: number;
  /** Describes the whole operation, for assistive tech. */
  label: string;
  className?: string;
}) {
  const safeTotal = Math.max(1, total);
  const clamped = Math.min(Math.max(step, 1), safeTotal);
  const percent = (clamped / safeTotal) * 100;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuenow={clamped}
      className={cn('h-1.5 w-full overflow-hidden rounded-base bg-sunken', className)}
    >
      <div
        className="h-full rounded-base bg-primary-solid transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
