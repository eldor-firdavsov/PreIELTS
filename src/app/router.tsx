import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireGuest, RequireOnboarding, RequireProfile } from './guards.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { AppShell } from './AppShell.tsx';
import { Card, EmptyState, Skeleton } from '../design-system/index.ts';

/**
 * Route tree with a lazy boundary per feature, so the exam engine and its
 * renderers never land in the bundle a signing-in student downloads.
 */
const SignInPage = lazy(() => import('../features/auth/pages/SignInPage.tsx'));
const SignUpPage = lazy(() => import('../features/auth/pages/SignUpPage.tsx'));
const OnboardingPage = lazy(() => import('../features/onboarding/pages/OnboardingPage.tsx'));
const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage.tsx'));
const TestsPage = lazy(() => import('../features/tests/pages/TestsPage.tsx'));
const HistoryPage = lazy(() => import('../features/history/pages/HistoryPage.tsx'));
const AnalysisPage = lazy(() => import('../features/analysis/pages/AnalysisPage.tsx'));
const ResultPage = lazy(() => import('../features/results/pages/ResultPage.tsx'));
// The exam surface sits outside the app shell: no navigation chrome during a test.
const ReadingTestPage = lazy(() => import('../features/reading/pages/ReadingTestPage.tsx'));
const ListeningTestPage = lazy(() => import('../features/listening/pages/ListeningTestPage.tsx'));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading page">
      <div>
        <Skeleton className="h-8 w-48 sm:w-64" />
        <Skeleton className="mt-2 h-4 w-72 sm:w-96" />
      </div>

      <div className="glass rounded-lg p-5 sm:p-6 flex flex-col gap-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1 h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="glass flex w-full flex-col rounded-lg p-[18px] min-h-[160px] shadow-rest">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-5 w-16 rounded-pill" />
            </div>
            <Skeleton className="mt-2.5 h-5 w-3/4" />
            <Skeleton className="mt-1.5 h-3.5 w-1/2" />
            <div className="mt-auto flex items-baseline gap-6 pt-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <Card>
      <EmptyState title="Page not found" description="That route does not exist." />
    </Card>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      {/* Outside the Suspense boundary: a chunk that fails to download rejects
          through here, so the fallback stops pulsing and says what happened. */}
      <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/sign-in"
            element={
              <RequireGuest>
                <SignInPage />
              </RequireGuest>
            }
          />
          <Route
            path="/sign-up"
            element={
              <RequireGuest>
                <SignUpPage />
              </RequireGuest>
            }
          />

          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <RequireOnboarding>
                  <OnboardingPage />
                </RequireOnboarding>
              </RequireAuth>
            }
          />

          <Route
            path="/tests/:testId/reading"
            element={
              <RequireAuth>
                <RequireProfile>
                  <ReadingTestPage />
                </RequireProfile>
              </RequireAuth>
            }
          />
          <Route
            path="/tests/:testId/listening"
            element={
              <RequireAuth>
                <RequireProfile>
                  <ListeningTestPage />
                </RequireProfile>
              </RequireAuth>
            }
          />

          <Route
            element={
              <RequireAuth>
                <RequireProfile>
                  <AppShell />
                </RequireProfile>
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tests" element={<TestsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/results/:resultId" element={<ResultPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
