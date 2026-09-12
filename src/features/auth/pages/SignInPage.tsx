import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Input, errorMessage } from '../../../design-system/index.ts';
import { useSignIn } from '../hooks/useAuthActions.ts';
import { AuthLayout } from './AuthLayout.tsx';

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const canSubmit = email.trim() !== '' && password !== '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    signIn.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(from, { replace: true }) },
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Continue your IELTS preparation.">
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={signIn.isPending}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={signIn.isPending}
              error={signIn.isError ? errorMessage(signIn.error) : undefined}
              required
            />
            <Button type="submit" disabled={!canSubmit} loading={signIn.isPending} loadingLabel="Signing in">
              Sign in
            </Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        No account yet?{' '}
        <Link to="/sign-up" className="font-medium text-primary hover:text-primary-hover">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
