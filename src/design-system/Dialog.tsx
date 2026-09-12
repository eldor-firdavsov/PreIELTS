import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Built on the native <dialog> element, so focus trapping, Escape and the
 * top layer come from the platform rather than from a dependency.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // showModal() gives the element a role but not a name. Without these the
  // screen reader announces a bare "dialog" at the one irreversible moment
  // in every paper.
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'w-[calc(100%-2rem)] max-w-md rounded-lg border border-glass-bd bg-glass-strong p-0 text-ink shadow-float',
        'backdrop:bg-overlay backdrop:backdrop-blur-sm',
        'open:animate-in motion-reduce:animate-none',
        className,
      )}
    >
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        {description && (
          <p id={descriptionId} className="mt-1 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {children && <div className="px-4 py-4 sm:px-5">{children}</div>}
      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>
      )}
    </dialog>
  );
}
