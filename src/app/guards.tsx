import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth.tsx';
import { useProfile } from '../features/onboarding/hooks/useProfile.ts';
import { ErrorState, Skeleton, errorMessage } from '../design-system/index.ts';

/**
 * Route guards.
 *
 * docs/ARCHITECTURE.md also lists RequireSession, which gates a route on an
 * in-progress test session. It is deliberately absent: test sessions do not
 * exist yet, and a guard that always passes is worse than no guard.
 */

function Waiting() {
  return (
    <div className="flex flex-col gap-6 py-8 animate-pulse" role="status" aria-label="Authenticating">
      <div>
        <Skeleton className="h-8 w-48 sm:w-60" />
        <Skeleton className="mt-2 h-4 w-72 sm:w-80" />
      </div>
      <div className="glass rounded-lg p-5 sm:p-6 flex flex-col gap-3.5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** Sends signed-out visitors to sign in, remembering where they were headed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <Waiting />;
  if (!session) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Keeps a signed-in student off the sign-in and sign-up screens. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { session, initialising } = useAuth();

  if (initialising) return <Waiting />;
  if (session) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * Sends a signed-in student who has not finished onboarding to the form.
 *
 * The test is `onboarded_at`, not the presence of a row: a profile written but
 * not completed is not onboarding done. A failed profile read is shown rather
 * than swallowed, because silently treating "we could not tell" as "not
 * onboarded" would trap a student in a form they have already filled in.
 */
export function RequireProfile({ children }: { children: ReactNode }) {
  const profile = useProfile();

  if (profile.isLoading) return <Waiting />;
  if (profile.error) {
    return (
      <ErrorState
        title="Your profile could not be loaded"
        description={errorMessage(profile.error)}
        onRetry={() => void profile.refetch()}
      />
    );
  }
  if (!profile.data?.onboarded_at) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Keeps an onboarded student off the onboarding form. */
export function RequireOnboarding({ children }: { children: ReactNode }) {
  const profile = useProfile();

  if (profile.isLoading) return <Waiting />;
  if (profile.data?.onboarded_at) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
