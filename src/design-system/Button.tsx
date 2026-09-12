import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks interaction. Implies disabled. */
  loading?: boolean;
  loadingLabel?: string;
  /** Fills its container. Used for the stacked layouts on narrow screens. */
  block?: boolean;
  children: ReactNode;
  className?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-primary to-primary-hover text-primary-on shadow-rest hover:shadow-md hover:shadow-primary/20 ' +
    'active:scale-[0.985] transition-all duration-200 ' +
    'disabled:hover:from-primary disabled:hover:to-primary disabled:active:scale-100',
  secondary:
    'glass text-ink border border-line-strong/60 hover:border-line-strong hover:bg-surface/70 ' +
    'active:scale-[0.985] transition-all duration-200 ' +
    'disabled:hover:bg-transparent disabled:active:scale-100',
  ghost:
    'bg-transparent text-primary hover:bg-primary-subtle ' +
    'active:scale-[0.985] transition-all duration-200 ' +
    'disabled:hover:bg-transparent disabled:active:scale-100',
  danger:
    'bg-surface text-danger border border-danger/45 hover:bg-danger-subtle ' +
    'hover:border-danger active:scale-[0.985] transition-all duration-200 ' +
    'disabled:hover:bg-surface disabled:active:scale-100',
};

/**
 * Heights are on a 4px rhythm and every size clears the 44px pointer target at
 * `md` and above once its padding is counted. `sm` exists for controls that sit
 * inside dense rows, where the whole row is the target.
 */
const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  block = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-base font-semibold',
        'transition-[background-color,border-color,color,box-shadow] duration-150 select-none',
        'disabled:cursor-not-allowed disabled:opacity-55',
        // Never let a long label blow out a narrow layout.
        'max-w-full',
        block && 'w-full',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      <span className="truncate">{loading && loadingLabel ? loadingLabel : children}</span>
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8a6.5 6.5 0 0 0-6.5-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
