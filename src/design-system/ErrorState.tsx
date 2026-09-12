import { Button } from './Button.tsx';
import { cn } from '../lib/utils/cn.ts';

interface ErrorStateProps {
  title?: string;
  /** The failure in plain words. Never a raw stack trace. */
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}
    >
      <p className="text-sm font-medium text-danger">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {onRetry && (
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying} loadingLabel="Retrying">
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/** Normalises anything thrown into a sentence worth showing a student. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred.';
}
