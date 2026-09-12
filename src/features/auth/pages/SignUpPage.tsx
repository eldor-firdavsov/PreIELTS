import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Input, errorMessage } from '../../../design-system/index.ts';
import { useSignUp } from '../hooks/useAuthActions.ts';
import { AuthLayout } from './AuthLayout.tsx';

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpPage() {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const passwordTooShort = password !== '' && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim() !== '' && password.length >= MIN_PASSWORD_LENGTH;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    signUp.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          // A new account has no profile, so navigate directly to onboarding
          navigate('/onboarding', { replace: true });
        },
      },
    );
  }

  return (
    <AuthLayout title="Create an account" subtitle="Track your band across every practice test.">
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={signUp.isPending}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={signUp.isPending}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              error={
                passwordTooShort
                  ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
                  : signUp.isError
                    ? errorMessage(signUp.error)
                    : undefined
              }
              required
            />
            <Button type="submit" disabled={!canSubmit} loading={signUp.isPending} loadingLabel="Creating account">
              Create account
            </Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-primary hover:text-primary-hover">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
