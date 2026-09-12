import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button, SkeletonLines, ThemeToggle } from '../design-system/index.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { useSignOut } from '../features/auth/hooks/useAuthActions.ts';
import { cn } from '../lib/utils/cn.ts';

/**
 * The signed-in chrome.
 *
 * Two navigation shapes, not one squeezed to fit. From `sm` up the four
 * destinations sit inline in the header, which is where a desktop user looks
 * for them. Below that they move to a fixed bar at the bottom of the viewport:
 * on a phone the top of the screen is the hardest place to reach and the header
 * had four links, an email address and a sign-out button competing for about
 * 360px. The bar is the same four destinations, thumb-height, and the header
 * keeps only identity and account.
 *
 * The content column grows with the viewport rather than stopping at a fixed
 * width. A 3440px display was previously showing 1152px of content and 2288px
 * of empty canvas.
 */

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '◧' },
  { to: '/tests', label: 'Tests', icon: '◈' },
  { to: '/history', label: 'History', icon: '◔' },
  { to: '/analysis', label: 'Analysis', icon: '◑' },
];

export function AppShell() {
  const signOut = useSignOut();
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-dvh flex-col">
      {/* Dynamic ambient floating glow lights for glassmorphic depth across all pages */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/4 h-[550px] w-[550px] rounded-full bg-primary/12 blur-[140px] animate-float-slow" />
        <div className="absolute top-1/3 -right-28 h-[480px] w-[480px] rounded-full bg-amber-500/10 blur-[130px] animate-float-reverse" />
        <div className="absolute bottom-10 left-1/3 h-[420px] w-[420px] rounded-full bg-rose-500/8 blur-[120px]" />
      </div>

      {/* Keyboard users should not have to tab the whole nav on every page. */}
      <a
        href="#main"
        className={cn(
          'sr-only focus:not-sr-only',
          'focus:fixed focus:left-4 focus:top-4 focus:z-50',
          'focus:rounded-base focus:bg-surface focus:px-4 focus:py-2',
          'focus:text-sm focus:font-medium focus:text-ink focus:shadow-float',
        )}
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-glass-bd/80 bg-glass-strong backdrop-blur-2xl shadow-xs transition-all duration-200">
        <div className="shell flex h-14 items-center gap-3 sm:gap-6">
          <span className="text-base font-bold tracking-tight text-ink">
            IELTS <span className="text-primary">Practice</span>
          </span>

          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]',
                    isActive
                      ? 'bg-primary-subtle text-primary shadow-xs'
                      : 'text-ink-muted hover:bg-surface/60 hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              loading={signOut.isPending}
              loadingLabel="Signing out"
              className="text-primary font-semibold hover:text-primary-hover active:scale-[0.97]"
              onClick={() =>
                signOut.mutate(undefined, {
                  onSuccess: () => navigate('/sign-in', { replace: true }),
                })
              }
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="shell relative z-10 w-full flex-1 py-6 pb-24 sm:py-8 sm:pb-10 smooth-in">
        {/* Inside the shell, not around it: switching tabs should not blank the
            navigation while the next page's chunk downloads. Outside the
            Suspense boundary, so a chunk that fails to arrive stops pulsing. */}
        <ErrorBoundary>
          <Suspense fallback={<SkeletonLines lines={6} label="Loading this page" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <nav
        aria-label="Mobile main"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-glass-bd bg-glass-strong backdrop-blur-2xl shadow-float sm:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="grid grid-cols-4 py-1">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5',
                    'text-2xs font-semibold transition-colors',
                    isActive ? 'text-primary' : 'text-ink-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-6 w-10 items-center justify-center rounded-pill text-sm transition-colors',
                        isActive ? 'bg-primary-subtle text-primary' : 'bg-transparent text-ink-muted',
                      )}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
