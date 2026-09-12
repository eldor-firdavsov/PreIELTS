import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../features/auth/hooks/useAuth.tsx';

/**
 * Every cross-cutting provider, composed once. Theme has no provider: the
 * design tokens are plain CSS variables on :root.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  // Created in state so React 18 strict-mode double mounting does not discard
  // the cache and refetch everything.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
