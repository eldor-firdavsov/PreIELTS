import { useEffect, useState } from 'react';
import { applyTheme, readTheme, resolveTheme, type ThemeChoice } from '../lib/theme.ts';
import { cn } from '../lib/utils/cn.ts';

/**
 * Single-button light / dark mode toggle.
 *
 * Toggles directly between light and dark modes on click with sun / moon icon.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const choice = readTheme();
    setResolvedTheme(resolveTheme(choice));

    if (choice === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (event: MediaQueryListEvent) => {
        if (readTheme() === 'system') {
          setResolvedTheme(event.matches ? 'dark' : 'light');
        }
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  function toggle() {
    const nextTheme: ThemeChoice = resolvedTheme === 'dark' ? 'light' : 'dark';
    setResolvedTheme(nextTheme);
    applyTheme(nextTheme);
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-pill border border-glass-bd bg-glass text-ink-muted transition-colors hover:bg-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary select-none',
        className,
      )}
    >
      {isDark ? (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
