import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '../lib/utils/cn.ts';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'> {
  label: string;
  options: SelectOption[];
  /** Waiting on the option list. Renders disabled with a placeholder. */
  loading?: boolean;
  error?: string;
  /** Hides the label visually and keeps it for assistive tech. */
  labelHidden?: boolean;
  /** Placeholder used when the option list is legitimately empty. */
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
}

export function Select({
  label,
  options,
  loading = false,
  error,
  labelHidden = false,
  emptyLabel = 'Nothing to choose from yet',
  placeholder,
  id,
  disabled,
  className,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const isEmpty = options.length === 0;
  // Disabled when told to be, while loading, or when there is nothing to pick.
  const isDisabled = disabled === true || loading || isEmpty;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className={cn(labelHidden ? 'sr-only' : 'text-xs font-medium text-ink')}>
        {label}
      </label>
      <select
        id={selectId}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(
          'h-10 rounded-base border bg-surface px-2.5 text-base text-ink sm:text-sm',
          'transition-[border-color] duration-150 hover:border-line-strong',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60',
          error ? 'border-danger' : 'border-line-strong',
          className,
        )}
        {...rest}
      >
        {loading && <option value="">Loading…</option>}
        {!loading && isEmpty && <option value="">{emptyLabel}</option>}
        {!loading && !isEmpty && placeholder && <option value="">{placeholder}</option>}
        {!loading &&
          options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
