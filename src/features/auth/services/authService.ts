import { supabase } from '../../../lib/supabase/client.ts';
import type { Session, User } from '@supabase/supabase-js';

/**
 * The only module in the app that talks to Supabase Auth.
 *
 * Everything above this layer deals in plain values and thrown Errors, so a
 * component never sees a Supabase response envelope.
 */

export interface Credentials {
  email: string;
  password: string;
}

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  return unwrap(data.session, error);
}

export async function signIn({ email, password }: Credentials): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const result = unwrap(data, error);
  if (!result.session) throw new Error('Sign in did not return a session.');
  return result.session;
}

export interface SignUpResult {
  user: User | null;
  /**
   * True when the project requires email confirmation, so no session exists
   * yet and the caller must tell the student to check their inbox.
   */
  needsEmailConfirmation: boolean;
}

export async function signUp({ email, password }: Credentials): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  const result = unwrap(data, error);
  return { user: result.user, needsEmailConfirmation: result.session === null };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/** Fires on sign in, sign out and token refresh. Returns an unsubscribe. */
export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}
