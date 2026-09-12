import type { ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';

/**
 * A small status label.
 *
 * `primary` marks something interactive or currently active. `danger`,
 * `success` and `warn` are status and never mean "press me". The two used to be
 * the same red, which is why `tone="brand"` is gone: naming a tone after the
 * brand invites it to be used for whatever happens to look right.
 */
type Tone = 'neutral' | 'primary' | 'success' | 'warn' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-muted border border-border-subtle/50',
  primary: 'bg-primary-subtle text-primary border border-primary/30 font-bold',
  success: 'bg-success-subtle text-success border border-success/25 font-semibold',
  warn:    'bg-warn-subtle text-warn border border-warn/25 font-semibold',
  danger:  'bg-danger-subtle text-danger border border-danger/25 font-semibold',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-pill',
        'px-2.5 py-0.5 text-2xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
