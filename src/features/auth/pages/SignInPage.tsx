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
  const [showPassword, setShowPassword] = useState(false);

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
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your IELTS preparation and track your band."
    >
      <Card className="glass overflow-hidden border-glass-bd shadow-rest transition-all duration-200 hover:shadow-float">
        <CardBody className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={signIn.isPending}
              autoFocus
              required
            />

            <div className="relative flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-ink">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={signIn.isPending}
                  required
                  className="h-10 w-full rounded-base border border-line-strong bg-surface px-3 pr-10 text-base text-ink transition-[border-color] duration-150 placeholder:text-ink-faint hover:border-ink/50 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60 sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink focus-visible:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {signIn.isError && (
              <div className="rounded-base border border-danger/30 bg-danger/10 p-3 text-xs font-medium text-danger flex items-start gap-2">
                <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage(signIn.error)}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              loading={signIn.isPending}
              loadingLabel="Signing in..."
              className="mt-2 w-full justify-center h-10 font-semibold"
            >
              Sign In
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-5 text-center text-sm text-ink-muted">
        Don't have an account yet?{' '}
        <Link to="/sign-up" className="font-semibold text-primary hover:underline underline-offset-4">
          Create one for free
        </Link>
      </p>
    </AuthLayout>
  );
}
