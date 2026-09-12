import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorState, Input, ThemeToggle, errorMessage } from '../../../design-system/index.ts';
import { useCompleteOnboarding } from '../hooks/useProfile.ts';
import type { CefrLevel, LevelScale } from '../services/profileService.ts';
import { cn } from '../../../lib/utils/cn.ts';

const BANDS = Array.from({ length: 19 }, (_, index) => (index / 2).toFixed(1));
const POPULAR_TARGET_BANDS = ['6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0'];
const CEFR: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const CEFR_HINT: Record<CefrLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
};

const TARGET_DESCRIPTIONS: Record<string, string> = {
  '6.0': 'Competent User — standard requirement for technical courses, foundation years & work visas.',
  '6.5': 'Good User — standard requirement for undergraduate admissions and direct entry at most universities.',
  '7.0': 'Good User+ — required by most Master\'s programs, law, healthcare & professional registrations.',
  '7.5': 'Very Good User — competitive requirement for top universities (Oxford, Cambridge, Imperial, Ivy League).',
  '8.0': 'Very Good User+ — superior language proficiency; required for advanced medical and diplomatic roles.',
  '8.5': 'Expert User — near-native academic mastery, top 2% of candidates globally.',
  '9.0': 'Expert User (Max Band) — flawless command of English.',
};

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState<Step>(1);
  const [fullName, setFullName] = useState('');
  const [levelScale, setLevelScale] = useState<LevelScale>('unsure');
  const [currentBand, setCurrentBand] = useState('6.0');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>('B1');
  const [targetBand, setTargetBand] = useState('7.0');
  const [touched, setTouched] = useState(false);

  const nameValid = fullName.trim().length > 0;

  function handleNext() {
    setTouched(true);
    if (step === 1 && !nameValid) return;
    if (step < 3) {
      setStep((s) => (s + 1) as Step);
      setTouched(false);
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nameValid) {
      setStep(1);
      return;
    }

    await complete.mutateAsync({
      fullName: fullName.trim(),
      levelScale,
      currentBand: levelScale === 'ielts' ? Number(currentBand) : null,
      cefrLevel: levelScale === 'cefr' ? cefrLevel : null,
      targetBand: targetBand === '' ? null : Number(targetBand),
    });
    navigate('/dashboard', { replace: true });
  }

  const stepTitles = {
    1: { title: 'What should we call you?', subtitle: 'Let us personalize your IELTS study space.' },
    2: { title: 'Where are you starting from?', subtitle: 'This helps our AI calibrate test difficulty and analytics.' },
    3: { title: 'What is your target band score?', subtitle: 'Your personalized study plan will be built to hit this goal.' },
  };

  return (
    <div className="relative min-h-dvh flex flex-col bg-canvas text-ink selection:bg-primary-subtle">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 left-1/4 h-[520px] w-[520px] rounded-full bg-primary/16 blur-[130px] animate-float-slow" />
        <div className="absolute bottom-10 -right-20 h-[420px] w-[420px] rounded-full bg-amber-500/14 blur-[120px] animate-float-reverse" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex h-16 w-full items-center justify-between px-5 sm:px-8 border-b border-line/40 backdrop-blur-md">
        <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white shadow-md shadow-primary/20">
            <span className="font-mono text-sm font-black tracking-tight">IQ</span>
          </div>
          <span className="text-base font-bold tracking-tight text-ink">
            IELTS <span className="text-primary">Practice</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-xl smooth-in">
          {/* Step Progress Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-muted">
              <span className="uppercase tracking-wider text-primary font-bold">Step {step} of 3</span>
              <span>
                {step === 1 && 'Profile'}
                {step === 2 && 'Baseline Level'}
                {step === 3 && 'Target Goal'}
              </span>
            </div>
            {/* Progress Bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-hover transition-all duration-300 ease-out"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          {/* Step Title Header */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-ink leading-tight">
              {stepTitles[step].title}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {stepTitles[step].subtitle}
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="glass-panel overflow-hidden rounded-2xl p-6 sm:p-8 shadow-float transition-all">
                {/* STEP 1: Name */}
                {step === 1 && (
                  <div className="flex flex-col gap-6">
                    <Input
                      label="Your full name or nickname"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="e.g. Eldor Firdavsov"
                      autoComplete="name"
                      autoFocus
                      required
                      error={touched && !nameValid ? 'Please enter what we should call you.' : undefined}
                    />

                    {fullName.trim().length > 0 && (
                      <div className="rounded-base border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white font-bold text-base">
                          {fullName.trim().charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            Welcome, {fullName.trim()}!
                          </p>
                          <p className="text-xs text-ink-muted">
                            Your dashboard, study plan, and certificates will use this name.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: Starting Level */}
                {step === 2 && (
                  <div className="flex flex-col gap-5">
                    <div className="grid gap-3">
                      {/* Option 1: IELTS Band */}
                      <div
                        onClick={() => setLevelScale('ielts')}
                        className={cn(
                          'cursor-pointer rounded-lg border p-4 transition-all duration-150',
                          levelScale === 'ielts'
                            ? 'border-primary bg-primary-subtle/50 ring-1 ring-primary shadow-sm'
                            : 'border-line bg-surface hover:border-line-strong hover:bg-sunken/40',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base',
                            levelScale === 'ielts' ? 'bg-primary text-white' : 'bg-surface text-ink-muted border border-line-strong'
                          )}>
                            🏆
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm sm:text-base text-ink">
                                I have an IELTS score
                              </span>
                              <input
                                type="radio"
                                name="level-scale"
                                checked={levelScale === 'ielts'}
                                onChange={() => setLevelScale('ielts')}
                                className="accent-[var(--primary)] h-4 w-4"
                              />
                            </div>
                            <p className="text-xs text-ink-muted mt-0.5">
                              From an official IELTS test or a recent full mock exam.
                            </p>

                            {levelScale === 'ielts' && (
                              <div className="mt-3.5 pt-3 border-t border-primary/20 flex flex-wrap items-center gap-3">
                                <label className="text-xs font-semibold text-ink">
                                  Overall Band:
                                </label>
                                <select
                                  value={currentBand}
                                  onChange={(e) => setCurrentBand(e.target.value)}
                                  className="h-9 rounded-base border border-line-strong bg-surface px-3 text-sm font-semibold text-ink focus-visible:outline-primary"
                                >
                                  {BANDS.map((b) => (
                                    <option key={b} value={b}>Band {b}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Option 2: CEFR Level */}
                      <div
                        onClick={() => setLevelScale('cefr')}
                        className={cn(
                          'cursor-pointer rounded-lg border p-4 transition-all duration-150',
                          levelScale === 'cefr'
                            ? 'border-primary bg-primary-subtle/50 ring-1 ring-primary shadow-sm'
                            : 'border-line bg-surface hover:border-line-strong hover:bg-sunken/40',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base',
                            levelScale === 'cefr' ? 'bg-primary text-white' : 'bg-surface text-ink-muted border border-line-strong'
                          )}>
                            🎓
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm sm:text-base text-ink">
                                I know my CEFR level
                              </span>
                              <input
                                type="radio"
                                name="level-scale"
                                checked={levelScale === 'cefr'}
                                onChange={() => setLevelScale('cefr')}
                                className="accent-[var(--primary)] h-4 w-4"
                              />
                            </div>
                            <p className="text-xs text-ink-muted mt-0.5">
                              European language framework (A1 to C2) from school or language courses.
                            </p>

                            {levelScale === 'cefr' && (
                              <div className="mt-3.5 pt-3 border-t border-primary/20">
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                  {CEFR.map((level) => (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCefrLevel(level);
                                      }}
                                      className={cn(
                                        'flex flex-col items-center justify-center p-2 rounded-base border text-xs font-bold transition-all',
                                        cefrLevel === level
                                          ? 'border-primary bg-primary text-white shadow-sm'
                                          : 'border-line-strong bg-surface text-ink hover:border-primary',
                                      )}
                                    >
                                      <span>{level}</span>
                                      <span className="text-[10px] font-normal opacity-80">{CEFR_HINT[level]}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Option 3: Not Sure Yet */}
                      <div
                        onClick={() => setLevelScale('unsure')}
                        className={cn(
                          'cursor-pointer rounded-lg border p-4 transition-all duration-150',
                          levelScale === 'unsure'
                            ? 'border-primary bg-primary-subtle/50 ring-1 ring-primary shadow-sm'
                            : 'border-line bg-surface hover:border-line-strong hover:bg-sunken/40',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base',
                            levelScale === 'unsure' ? 'bg-primary text-white' : 'bg-surface text-ink-muted border border-line-strong'
                          )}>
                            ✨
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm sm:text-base text-ink">
                                I'm not sure yet
                              </span>
                              <input
                                type="radio"
                                name="level-scale"
                                checked={levelScale === 'unsure'}
                                onChange={() => setLevelScale('unsure')}
                                className="accent-[var(--primary)] h-4 w-4"
                              />
                            </div>
                            <p className="text-xs text-ink-muted mt-0.5">
                              No problem! Your very first practice test will diagnose your exact baseline score.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: Target Band */}
                {step === 3 && (
                  <div className="flex flex-col gap-6">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-3 block">
                        Select your goal band
                      </label>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {POPULAR_TARGET_BANDS.map((b) => {
                          const isSelected = targetBand === b;
                          return (
                            <button
                              key={b}
                              type="button"
                              onClick={() => setTargetBand(b)}
                              className={cn(
                                'flex flex-col items-center justify-center py-2.5 rounded-lg border font-mono font-bold text-sm sm:text-base transition-all',
                                isSelected
                                  ? 'border-primary bg-primary text-white shadow-md scale-105 z-10'
                                  : 'border-line-strong bg-surface text-ink hover:border-primary hover:bg-primary-subtle/30',
                              )}
                            >
                              <span>{b}</span>
                              <span className="text-[10px] font-sans font-normal opacity-85">Band</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Band Target Insight Card */}
                    {targetBand && TARGET_DESCRIPTIONS[targetBand] && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                        <span className="text-xl shrink-0 mt-0.5">🎯</span>
                        <div className="text-xs sm:text-sm text-ink leading-relaxed">
                          <strong className="text-primary font-bold">Band {targetBand} Target: </strong>
                          {TARGET_DESCRIPTIONS[targetBand]}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-line/40 text-xs text-ink-muted">
                      <span>Or specify another target:</span>
                      <select
                        value={targetBand}
                        onChange={(e) => setTargetBand(e.target.value)}
                        className="h-8 rounded-base border border-line-strong bg-surface px-2.5 text-xs font-semibold text-ink"
                      >
                        <option value="">No target set</option>
                        {BANDS.map((b) => (
                          <option key={b} value={b}>Band {b}</option>
                        ))}
                      </select>
                    </div>

                    {/* Summary badge */}
                    <div className="rounded-xl border border-line bg-surface/60 p-3.5 flex items-center justify-between text-xs backdrop-blur-sm">
                      <span className="text-ink-muted">Student: <strong className="text-ink">{fullName}</strong></span>
                      <span className="text-ink-muted">Goal: <strong className="text-primary font-bold">{targetBand ? `Band ${targetBand}` : 'Flexible'}</strong></span>
                    </div>
                  </div>
                )}
            </div>

            {complete.isError && (
              <div className="mt-4">
                <ErrorState
                  title="Your answers could not be saved"
                  description={errorMessage(complete.error)}
                />
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="mt-6 flex items-center justify-between gap-4">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-base border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink/50 transition-colors"
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}

              {step < 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="min-w-[140px] justify-center font-semibold"
                >
                  Continue →
                </Button>
              ) : (
                <Button
                  type="submit"
                  loading={complete.isPending}
                  loadingLabel="Setting up your dashboard..."
                  className="min-w-[200px] justify-center font-semibold bg-primary hover:bg-primary-hover shadow-md"
                >
                  Start Practising →
                </Button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
