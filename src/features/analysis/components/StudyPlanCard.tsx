import { Link } from 'react-router-dom';
import {
  Button, EmptyState, ErrorState, Skeleton, errorMessage,
} from '../../../design-system/index.ts';
import type { StudyPlan, StudySkill } from '../../../lib/ai/study-plan.ts';
import { useStudyPlan } from '../hooks/useAnalysis.ts';

const SKILL_LABEL: Record<StudySkill, string> = {
  listening: 'Listening',
  reading: 'Reading',
};

/**
 * "What should I improve next?" — SPEC.md §16.
 *
 * The one screen on this platform where a model gives advice rather than a
 * verdict, and the rules are correspondingly different. Everything it says is
 * reasoned from counts the database computed, never from a test paper or an
 * essay, and it is asked for rather than generated on arrival: a student who
 * opens this page to look at their chart has not asked for coaching.
 *
 * The caveat is not a disclaimer bolted on at the end. A plan written from one
 * paper is a first read and the student is told so in the model's own words,
 * because a confident-sounding plan built on a single test is the fastest way
 * to send someone to practise the wrong thing.
 */
export function StudyPlanCard() {
  const { stored, generate } = useStudyPlan();

  const plan = generate.data?.plan ?? stored.data?.plan ?? null;
  const enoughEvidence = generate.data?.enoughEvidence ?? stored.data?.enoughEvidence ?? true;

  return (
    <section className="glass-panel overflow-hidden rounded-2xl shadow-lift">
      <div className="flex items-center justify-between gap-3 border-b border-glass-bd px-4 py-3.5 sm:px-5">
        <h2 className="text-lg font-semibold text-ink sm:text-[20px]">What should I improve next?</h2>
        <span className="glass-pill border border-primary/30 rounded-pill px-3 py-0.5 text-xs font-semibold text-primary">
          AI coach
        </span>
      </div>

      {stored.isLoading && <PlanSkeleton />}

      {stored.error && (
        <div className="p-4 sm:p-5">
          <ErrorState
            title="Your plan could not be loaded"
            description={errorMessage(stored.error)}
            onRetry={() => void stored.refetch()}
          />
        </div>
      )}

      {/* An empty history is not a student with no weaknesses. Say so. */}
      {!stored.isLoading && !stored.error && !enoughEvidence && (
        <EmptyState
          title="Not enough evidence yet"
          description="Not enough evidence yet. A plan written from a single paper is a guess with your name on it. Sit one more test in either skill and this will have something to work from."
          action={
            <Link to="/tests" className="text-xs font-semibold uppercase tracking-wide text-primary hover:text-primary-hover">
              Take a test →
            </Link>
          }
        />
      )}

      {!stored.isLoading && !stored.error && enoughEvidence && !plan && (
        <div className="flex flex-col items-start gap-3 p-4 sm:p-5">
          <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
            The coach reads the counts below — your bands, your accuracy by question type and by
            section, and your timing — and says which one thing to work on next. It never sees a
            passage, an essay or a recording.
          </p>
          <Button
            onClick={() => generate.mutate()}
            loading={generate.isPending}
            loadingLabel="Reading your results…"
          >
            Write my study plan
          </Button>
          {generate.isPending && (
            <div className="w-full mt-2 pt-4 border-t border-glass-bd">
              <PlanSkeleton />
            </div>
          )}
          {generate.isError && (
            <ErrorState
              title="The plan could not be written"
              description={errorMessage(generate.error)}
              onRetry={() => generate.mutate()}
              retrying={generate.isPending}
            />
          )}
        </div>
      )}

      {plan && <PlanBody plan={plan} />}
    </section>
  );
}

function PlanSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading study plan"
      className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-5"
    >
      <div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-1.5 h-4 w-4/5" />
        <Skeleton className="mt-5 h-3 w-20" />
        <Skeleton className="mt-2 h-3.5 w-full" />
        <Skeleton className="mt-1.5 h-3.5 w-3/4" />
        <Skeleton className="mt-5 h-3 w-24" />
        <Skeleton className="mt-2 h-3.5 w-5/6" />
        <Skeleton className="mt-1.5 h-3.5 w-2/3" />
      </div>
      <div>
        <div className="rounded-xl border border-primary/30 bg-primary-subtle/30 backdrop-blur-md p-3.5 sm:p-4 mb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-4 w-48" />
          <Skeleton className="mt-1.5 h-3 w-full" />
        </div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-3.5 w-full" />
        <Skeleton className="mt-1.5 h-3.5 w-4/5" />
      </div>
    </div>
  );
}

function PlanBody({ plan }: { plan: StudyPlan }) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-5">
        {/* Left Column: Strengths & Weaknesses */}
        <div>
          {plan.overall_diagnosis && (
            <p className="text-sm leading-relaxed text-ink mb-4">{plan.overall_diagnosis}</p>
          )}

          <div className="lbl">Strengths</div>
          <div className="mt-1.5 mb-4.5 space-y-2">
            {plan.strengths.length > 0 ? (
              plan.strengths.map((strength) => (
                <p key={strength.area} className="text-sm text-ink-muted max-w-[60ch] leading-relaxed">
                  <strong className="text-ink font-medium">{strength.area}:</strong> {strength.evidence}
                </p>
              ))
            ) : (
              <p className="text-sm text-ink-muted max-w-[60ch]">No notable strengths detected yet.</p>
            )}
          </div>

          <div className="lbl mt-4">Weaknesses</div>
          <div className="mt-1.5 space-y-2">
            {plan.weaknesses.length > 0 ? (
              plan.weaknesses.map((weakness) => (
                <p key={weakness.area} className="text-sm text-ink-muted max-w-[60ch] leading-relaxed">
                  <strong className="text-ink font-medium">{weakness.area}:</strong> {weakness.evidence}{' '}
                  <span className="text-warn font-medium">{weakness.what_it_costs}</span>
                </p>
              ))
            ) : (
              <p className="text-sm text-ink-muted max-w-[60ch]">No major recurring weaknesses found.</p>
            )}
          </div>
        </div>

        {/* Right Column: Next action highlight & practice plan */}
        <div>
          <div className="border border-primary/30 bg-primary-subtle/40 backdrop-blur-md rounded-xl p-3.5 sm:p-4 mb-4.5">
            <div className="lbl text-primary">Next action ({SKILL_LABEL[plan.next_action.skill] ?? plan.next_action.skill})</div>
            <div className="text-sm sm:text-[15px] font-semibold text-ink mt-1">
              {plan.next_action.headline}
            </div>
            {plan.next_action.detail && (
              <p className="text-xs sm:text-sm text-ink-muted mt-1 leading-relaxed">{plan.next_action.detail}</p>
            )}
          </div>

          {plan.practice_plan.length > 0 && (
            <div>
              <div className="lbl">Practice plan</div>
              <ol className="list-decimal pl-5 text-sm text-ink-muted mt-2 space-y-1.5 leading-relaxed">
                {plan.practice_plan.map((step) => (
                  <li key={step.focus}>
                    <strong className="text-ink font-medium">{step.focus}:</strong> {step.how}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {plan.evidence_caveat && (
        <div className="border-t border-glass-bd px-4 py-2.5 sm:px-5 text-xs sm:text-[13px] text-warn">
          {plan.evidence_caveat}
        </div>
      )}
    </div>
  );
}
