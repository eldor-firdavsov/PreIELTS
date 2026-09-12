import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../../../design-system/index.ts';
import { cn } from '../../../lib/utils/cn.ts';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const location = useLocation();
  const isSignIn = location.pathname === '/sign-in';

  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-ink selection:bg-primary-subtle overflow-hidden">
      {/* Dynamic Ambient Background Lights */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-32 left-1/4 h-[520px] w-[520px] rounded-full bg-primary/18 blur-[130px] animate-float-slow" />
        <div className="absolute top-1/2 -right-24 h-[440px] w-[440px] rounded-full bg-amber-500/14 blur-[120px] animate-float-reverse" />
        <div className="absolute -bottom-20 left-1/3 h-[380px] w-[380px] rounded-full bg-rose-500/10 blur-[110px]" />
      </div>

      {/* Top Minimal Header */}
      <header className="relative z-10 flex h-16 w-full items-center justify-between px-5 sm:px-8">
        <Link to="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white shadow-md shadow-primary/20 transition-transform duration-200 group-hover:scale-105">
            <span className="font-mono text-sm font-black tracking-tight">IQ</span>
          </div>
          <span className="text-base font-bold tracking-tight text-ink">
            IELTS <span className="text-primary">Practice</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Glassmorphic Container */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[420px] smooth-in">
          {/* Glass Pill Tab Switcher */}
          <div className="glass-pill mb-5 flex rounded-pill p-1">
            <Link
              to="/sign-in"
              className={cn(
                'flex-1 rounded-pill py-2 text-center text-xs sm:text-sm font-semibold transition-all duration-200',
                isSignIn
                  ? 'bg-gradient-to-b from-primary to-primary-hover text-white shadow-sm shadow-primary/20'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Sign In
            </Link>
            <Link
              to="/sign-up"
              className={cn(
                'flex-1 rounded-pill py-2 text-center text-xs sm:text-sm font-semibold transition-all duration-200',
                !isSignIn
                  ? 'bg-gradient-to-b from-primary to-primary-hover text-white shadow-sm shadow-primary/20'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Create Account
            </Link>
          </div>

          {/* Frosted Glass Panel Card */}
          <div className="glass-panel overflow-hidden rounded-2xl p-6 sm:p-7 shadow-float transition-all duration-200">
            {/* Header text */}
            <div className="mb-5 text-center sm:text-left">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-xs sm:text-sm text-ink-muted font-normal">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Form & Actions */}
            <div className="relative">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Minimal Sleek Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-ink-faint">
        IELTS Practice Platform • © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
