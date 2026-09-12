import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/hooks/useAuth.tsx';
import { useProfile } from '../features/onboarding/hooks/useProfile.ts';
import { ErrorState, SkeletonLines, errorMessage } from '../design-system/index.ts';

/**
 * Route guards.
 *
 * docs/ARCHITECTURE.md also lists RequireSession, which gates a route on an
 * in-progress test session. It is deliberately absent: test sessions do not
 * exist yet, and a guard that always passes is worse than no guard.
 */

function Waiting() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <SkeletonLines lines={3} />
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
