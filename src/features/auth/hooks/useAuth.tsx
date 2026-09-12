import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '../services/authService.ts';

interface AuthState {
  session: Session | null;
  /** True until the first session lookup resolves. Guards must wait on this. */
  initialising: boolean;
  error: unknown;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the session for the whole app. Reads it once on mount, then follows
 * Supabase's auth events, so a refresh in another tab is picked up here too.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;

    getSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch((err: unknown) => {
        if (active) setError(err);
      })
      .finally(() => {
        if (active) setInitialising(false);
      });

    const unsubscribe = onAuthStateChange((next) => {
      if (!active) return;
      setSession(next);
      setInitialising(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({ session, initialising, error }), [session, initialising, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
