import { cn } from '../lib/utils/cn.ts';
import { Skeleton } from './Skeleton.tsx';

interface StatProps {
  label: string;
  /** Already formatted. Null renders an em dash, never a zero. */
  value: string | null;
  sub?: string;
  loading?: boolean;
  /** Large treatment for the single headline figure on a page. */
  emphasis?: boolean;
  className?: string;
}

export function Stat({ label, value, sub, loading = false, emphasis = false, className }: StatProps) {
  return (
    // A Stat is one figure inside a group of them, so it marks itself busy and
    // leaves the announcing to whatever region wraps the group. Four stats each
    // shouting "Loading" is four interruptions to say one thing.
    <div className={cn('flex flex-col gap-1', className)} aria-busy={loading || undefined}>
      <span className="lbl">{label}</span>
      {loading ? (
        <Skeleton className={cn(emphasis ? 'h-10 w-24' : 'h-8 w-16')} />
      ) : (
        <span
          className={cn(
            'mono font-mono font-semibold text-ink',
            emphasis ? 'text-3xl sm:text-[40px] leading-none' : 'text-2xl sm:text-[31px] leading-[1.1]',
            value === null && 'text-ink-faint',
          )}
        >
          {value ?? '—'}
        </span>
      )}
      {sub && !loading && <span className="text-xs sm:text-[13px] text-ink-muted">{sub}</span>}
    </div>
  );
}
