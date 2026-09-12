import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, ErrorState, Input, Select, errorMessage } from '../../../design-system/index.ts';
import { useCompleteOnboarding } from '../hooks/useProfile.ts';
import type { CefrLevel, LevelScale } from '../services/profileService.ts';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * Onboarding — asked once, right after sign-up.
 *
 * Three questions, because three is what the rest of the product actually uses:
 * a name to address the student by, where they are starting from, and where
 * they want to get to. Anything else would be a form for its own sake.
 *
 * The starting level is asked in whichever scale the student already knows. A
 * student who has sat IELTS thinks in bands; one who came through a language
 * course thinks in CEFR; a beginner knows neither. Forcing a band out of
 * someone who has never sat the test would record a guess as if it were a
 * measurement, so "I'm not sure" is a real answer here and is stored as one.
 */

const BANDS = Array.from({ length: 19 }, (_, index) => (index / 2).toFixed(1));
const CEFR: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const CEFR_HINT: Record<CefrLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
};

const SCALES: Array<{ value: LevelScale; title: string; description: string }> = [
  { value: 'ielts', title: 'I have an IELTS score', description: 'From a real test or a recent mock.' },
  { value: 'cefr', title: 'I know my CEFR level', description: 'A1 to C2, usually from a course or placement test.' },
  { value: 'unsure', title: "I'm not sure yet", description: 'Your first practice test will tell us.' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();

  const [fullName, setFullName] = useState('');
  const [levelScale, setLevelScale] = useState<LevelScale>('unsure');
  const [currentBand, setCurrentBand] = useState('6.0');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>('B1');
  const [targetBand, setTargetBand] = useState('7.0');
  const [touched, setTouched] = useState(false);

  const nameError = fullName.trim() === '' ? 'Tell us what to call you.' : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (nameError) return;

    await complete.mutateAsync({
      fullName,
      levelScale,
      currentBand: levelScale === 'ielts' ? Number(currentBand) : null,
      cefrLevel: levelScale === 'cefr' ? cefrLevel : null,
      targetBand: targetBand === '' ? null : Number(targetBand),
    });
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Onboarding</p>
      <h1 className="mt-1 text-[25px] font-bold tracking-tight text-ink sm:text-[28px]">Set up your account</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Three questions. They decide what your dashboard compares your results against.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-5">
        <Card>
          <CardBody className="flex flex-col gap-6">
            <Input
              label="Your name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="How should we address you?"
              autoComplete="name"
              autoFocus
              error={touched ? nameError ?? undefined : undefined}
            />

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold text-ink">Where are you starting from?</legend>
              <div className="flex flex-col gap-2">
                {SCALES.map((scale) => {
                  const selected = levelScale === scale.value;
                  return (
                    <label
                      key={scale.value}
                      className={cn(
                        'flex min-h-12 cursor-pointer items-start gap-3 rounded-base border px-3.5 py-3 text-sm transition-all',
                        selected
                          ? 'border-primary bg-primary-subtle shadow-[0_0_0_1px_var(--primary)]'
                          : 'border-line bg-surface hover:border-line-strong hover:bg-sunken',
                      )}
                    >
                      <input
                        type="radio"
                        name="level-scale"
                        value={scale.value}
                        checked={selected}
                        onChange={() => setLevelScale(scale.value)}
                        className="mt-0.5 accent-[var(--primary)]"
                      />
                      <span>
                        <span className="font-semibold text-ink">{scale.title}</span>
                        <span className="block text-xs text-ink-muted mt-0.5">{scale.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {levelScale === 'ielts' && (
                <div className="mt-2 rounded-base border-l-2 border-primary bg-surface/40 p-3.5 pl-4">
                  <Select
                    label="Your most recent overall band"
                    value={currentBand}
                    onChange={(event) => setCurrentBand(event.target.value)}
                    options={BANDS.map((band) => ({ value: band, label: band }))}
                    className="max-w-[14rem]"
                  />
                </div>
              )}

              {levelScale === 'cefr' && (
                <div className="mt-2 rounded-base border-l-2 border-primary bg-surface/40 p-3.5 pl-4">
                  <Select
                    label="Your CEFR level"
                    value={cefrLevel}
                    onChange={(event) => setCefrLevel(event.target.value as CefrLevel)}
                    options={CEFR.map((level) => ({ value: level, label: `${level} — ${CEFR_HINT[level]}` }))}
                    className="max-w-[18rem]"
                  />
                </div>
              )}
            </fieldset>

            <div className="border-t border-line/50 pt-4">
              <Select
                label="Band you are aiming for"
                value={targetBand}
                onChange={(event) => setTargetBand(event.target.value)}
                options={[{ value: '', label: 'No target yet' }, ...BANDS.map((band) => ({ value: band, label: band }))]}
                className="max-w-[14rem]"
              />
            </div>
          </CardBody>
        </Card>

        {complete.isError && (
          <ErrorState
            title="Your answers could not be saved"
            description={errorMessage(complete.error)}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={complete.isPending} loadingLabel="Saving">
            Start practising
          </Button>
          <span className="text-xs text-ink-muted">You can change all of this later.</span>
        </div>
      </form>
    </div>
  );
}
