import type { ReactNode } from 'react';
import { cn } from '../lib/utils/cn.ts';

/**
 * A grouped surface.
 *
 * Border, fill, radius and shadow each say "separate object", so they are spent
 * by role rather than stamped on every block. A resting card takes the border
 * and the lightest shadow; `interactive` adds the lift, and is only for cards
 * that are actually a link or a button.
 */
export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  /** This card is itself a control. Adds hover lift and a pointer affordance. */
  interactive?: boolean;
}) {
  return (
    <section
      className={cn(
        'glass overflow-hidden rounded-xl transition-all duration-200',
        interactive &&
          'cursor-pointer hover:shadow-lift hover:-translate-y-0.5 hover:border-glass-bd/90 active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={cn(
        // Wraps rather than crushes when a title and a trailing control meet on
        // a narrow screen.
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        'border-b border-line px-4 py-3 sm:px-5 sm:py-4',
        className,
      )}
    >
      {children}
    </header>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold text-ink', className)}>{children}</h2>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-4 sm:px-5 sm:py-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5',
        className,
      )}
    >
      {children}
    </footer>
  );
}
