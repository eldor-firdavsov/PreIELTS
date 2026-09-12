import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Input, errorMessage } from '../../../design-system/index.ts';
import { useSignUp } from '../hooks/useAuthActions.ts';
import { AuthLayout } from './AuthLayout.tsx';
import { cn } from '../../../lib/utils/cn.ts';

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpPage() {
  const navigate = useNavigate();
  const signUp = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const hasMinLength = password.length >= MIN_PASSWORD_LENGTH;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const canSubmit = email.trim() !== '' && hasMinLength;

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
    <AuthLayout
      title="Create your account"
      subtitle="Track your progress, get AI diagnostic feedback, and hit your target IELTS band."
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
              disabled={signUp.isPending}
              autoFocus
              required
            />

            <div className="relative flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={signUp.isPending}
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

              {/* Password strength checklist */}
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    hasMinLength
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'bg-line/40 text-ink-muted',
                  )}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    {hasMinLength ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="9" />}
                  </svg>
                  8+ characters
                </span>

                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    hasLetter && hasNumber
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'bg-line/40 text-ink-muted',
                  )}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    {hasLetter && hasNumber ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="9" />}
                  </svg>
                  Letters & numbers
                </span>
              </div>
            </div>

            {signUp.isError && (
              <div className="rounded-base border border-danger/30 bg-danger/10 p-3 text-xs font-medium text-danger flex items-start gap-2">
                <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage(signUp.error)}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              loading={signUp.isPending}
              loadingLabel="Creating account..."
              className="mt-2 w-full justify-center h-10 font-semibold"
            >
              Get Started Free
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-5 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-semibold text-primary hover:underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
