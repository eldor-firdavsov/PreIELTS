import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../lib/utils/cn.ts';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  hint?: string;
  /** Message shown under the field. Its presence marks the field invalid. */
  error?: string;
  className?: string;
}

export function Input({ label, hint, error, id, disabled, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-10 rounded-base border bg-surface px-3 text-base text-ink sm:text-sm',
          'transition-[border-color] duration-150',
          'placeholder:text-ink-faint hover:border-line-strong',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60',
          error ? 'border-danger' : 'border-line-strong',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
