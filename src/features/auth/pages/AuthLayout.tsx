import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../../../design-system/index.ts';
import { cn } from '../../../lib/utils/cn.ts';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const FEATURES = [
  {
    icon: (
      <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    label: 'Real Exam Timers',
  },
  {
    icon: (
      <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
    label: '4-Part Listening Player',
  },
  {
    icon: (
      <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
    label: 'Official Band 0–9 Conversion',
  },
  {
    icon: (
      <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    label: 'AI Diagnostics & Study Plan',
  },
];

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const location = useLocation();
  const isSignIn = location.pathname === '/sign-in';

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-ink selection:bg-primary-subtle">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[400px] w-[500px] rounded-full bg-amber-500/10 blur-[100px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 flex h-16 w-full items-center justify-between px-4 sm:px-8">
        <Link to="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
            <span className="font-mono text-sm font-black tracking-tight">IQ</span>
          </div>
          <span className="text-base font-bold tracking-tight text-ink">
            IELTS <span className="text-primary">Practice</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[428px]">
          {/* Top Auth Tab Switcher */}
          <div className="mb-6 flex rounded-pill border border-line-strong bg-surface/80 p-1 shadow-sm backdrop-blur-md">
            <Link
              to="/sign-in"
              className={cn(
                'flex-1 rounded-pill py-2 text-center text-xs sm:text-sm font-semibold transition-all',
                isSignIn
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Sign In
            </Link>
            <Link
              to="/sign-up"
              className={cn(
                'flex-1 rounded-pill py-2 text-center text-xs sm:text-sm font-semibold transition-all',
                !isSignIn
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Create Account
            </Link>
          </div>

          {/* Header text */}
          <div className="mb-5 text-center sm:text-left">
            <h1 className="text-2xl sm:text-[27px] font-bold tracking-tight text-ink leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-ink-muted">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form Card */}
          <div className="relative">
            {children}
          </div>

          {/* Platform Trust Highlights */}
          <div className="mt-8 rounded-lg border border-line/60 bg-surface/40 p-4 backdrop-blur-sm">
            <p className="mb-3 text-center sm:text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Included with every account
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {FEATURES.map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <span className="shrink-0">{f.icon}</span>
                  <span className="text-xs font-medium text-ink-muted">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-ink-muted">
        © {new Date().getFullYear()} IELTS Practice Platform. Independent computer-delivered simulation.
      </footer>
    </div>
  );
}
