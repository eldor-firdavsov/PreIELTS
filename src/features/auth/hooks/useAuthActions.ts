import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signIn, signOut, signUp } from '../services/authService.ts';
import type { Credentials, SignUpResult } from '../services/authService.ts';

/**
 * Mutations for the three auth actions. The session itself is not cached here;
 * `AuthProvider` owns it because Supabase pushes changes rather than being
 * polled. What these do own is the pending and error state a form needs.
 */
export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => signIn(credentials),
    // A new identity must never see the previous one's cached rows.
    onSuccess: () => queryClient.clear(),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation<SignUpResult, Error, Credentials>({
    mutationFn: (credentials: Credentials) => signUp(credentials),
    // Same reason as sign in: a new identity must not inherit cached rows,
    // and the profile query in particular must re-read as the new user.
    onSuccess: () => queryClient.clear(),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => queryClient.clear(),
  });
}
