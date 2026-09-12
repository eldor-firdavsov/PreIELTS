import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireGuest, RequireOnboarding, RequireProfile } from './guards.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { AppShell } from './AppShell.tsx';
import { Card, EmptyState, SkeletonLines } from '../design-system/index.ts';

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
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <SkeletonLines lines={4} />
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
