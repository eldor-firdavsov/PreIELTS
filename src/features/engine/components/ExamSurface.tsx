import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuestionRenderer, RendererProvider, type RendererRegistry } from '../QuestionRenderer.tsx';
import { submitSession, UnflushedAnswersError } from '../submit.ts';
import { isAnswered, useAnswerStore } from '../answerStore.ts';
import { findGroupOf } from '../types.ts';
import type { TestSession } from '../useTestSession.ts';
import { ExamChrome } from './ExamChrome.tsx';
import { SaveStatus } from './SaveStatus.tsx';
import { QuestionNav } from './QuestionNav.tsx';
import { FlagToggle } from './FlagToggle.tsx';
import { ErrorState, Skeleton, SkeletonLines, errorMessage } from '../../../design-system/index.ts';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * The surface for the two skills that have questions — docs/ARCHITECTURE.md §7.
 *
 * The layout itself is `ExamChrome`, the chrome every skill shares. What
 * this adds is everything question-shaped: the renderer registry, the group of
 * prompts in the right pane, and the question navigator along the bottom. The
 * right pane shows the current question's whole group, because a summary or a
 * table cannot be split across screens and the instructions belong with the
 * questions they govern.
 *
 * Only the left pane differs between reading and listening: a passage in one, a
 * player in the other. That is why this takes the stimulus as a node — the
 * engine stays content-agnostic, and a new skill is a stimulus pane plus a
 * renderer registry rather than another copy of this file.
 */
export function ExamSurface({
  session,
  registry,
  stimulus,
  headerExtra,
  partLabel,
  paneLabels,
}: {
  session: TestSession;
  registry: RendererRegistry;
  /** The left pane: a passage, a player, a task prompt. */
  stimulus: ReactNode;
  /** Extra status for the header, shown before the save indicator. */
  headerExtra?: ReactNode;
  /** What one section is called in this skill: "Part 1", "Section 1". */
  partLabel: (order: number) => string;
  /** What this skill calls its two panes, for the narrow-screen switcher. */
  paneLabels?: { stimulus: string; main: string };
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /*
   * Selecting a question from the navigator used to scroll it into view and
   * leave focus on the navigator button, so a keyboard user then tabbed
   * forward through everything in between to reach the field they had just
   * asked for. Focus now follows the selection.
   *
   * The flag matters: `currentIndex` also changes as a student tabs through
   * the answers normally, and moving focus on every change would fight them
   * for the caret. Only an explicit jump sets it.
   */
  const jumped = useRef(false);
  const jumpTo = useCallback(
    (indexOrId: number | string) => {
      jumped.current = true;
      session.goToQuestion(indexOrId);
    },
    [session],
  );

  const currentQuestionId = session.currentQuestion?.id;
  const currentOrder = session.currentQuestion?.order;
  useEffect(() => {
    if (!jumped.current || currentOrder === undefined) return;
    jumped.current = false;
    const item = document.getElementById(`question-${currentOrder}`);
    const field = item?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (field ?? item)?.focus({ preventScroll: false });
  }, [currentQuestionId, currentOrder]);

  /*
   * What the student is about to leave behind.
   *
   * The flag exists so a candidate can move past a hard question and return to
   * it, and the moment that promise gets broken is the submit dialog: press
   * Submit with six flagged questions still open and the paper is marked
   * without them. The real exam counts down in front of you; the least this can
   * do is say the number out loud before the decision is final.
   */
  const answers = useAnswerStore((state) => state.answers);
  const flags = useAnswerStore((state) => state.flagged);
  const outstanding = useMemo(() => {
    const unanswered = session.questions.filter(
      (q) => !isAnswered(answers[q.id]?.value ?? null),
    ).length;
    const flagged = session.questions.filter((q) => flags[q.id]).length;
    return { unanswered, flagged };
  }, [session.questions, answers, flags]);

  const submitWarning = useMemo(() => {
    const parts: string[] = [];
    if (outstanding.unanswered > 0) {
      parts.push(
        `${outstanding.unanswered} question${outstanding.unanswered === 1 ? '' : 's'} in this section ${outstanding.unanswered === 1 ? 'is' : 'are'} unanswered`,
      );
    }
    if (outstanding.flagged > 0) {
      parts.push(`${outstanding.flagged} ${outstanding.flagged === 1 ? 'is' : 'are'} flagged for review`);
    }
    if (parts.length === 0) return null;
    return `${parts.join(' and ')}. An unanswered question scores nothing; there is no penalty for guessing.`;
  }, [outstanding]);

  const group = useMemo(
    () => (session.section && session.currentQuestion
      ? findGroupOf(session.section, session.currentQuestion.id)
      : undefined),
    [session.section, session.currentQuestion],
  );

  async function handleSubmit() {
    if (!session.sessionId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { resultId } = await submitSession(session.sessionId);
      navigate(`/results/${resultId}`, { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof UnflushedAnswersError ? error.message : errorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RendererProvider registry={registry}>
      <ExamChrome
        title={session.title}
        headerExtra={
          <>
            {headerExtra}
            <SaveStatus />
          </>
        }
        secondsRemaining={session.secondsRemaining}
        tabs={session.sections.map((section) => ({
          id: section.id,
          label: partLabel(section.order),
        }))}
        paneLabels={paneLabels}
        activeIndex={session.sectionIndex}
        onSelectTab={(index) => void session.goToSection(index)}
        stimulus={stimulus}
        main={
          group ? (
            <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6 lg:px-8">
              <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                {group.instructions}
              </p>

              {group.sharedOptions && (
                <div className="mb-5 rounded-base bg-sunken p-3.5 sm:p-4 text-sm">
                  <div className="text-sm font-bold text-ink mb-1">List of options</div>
                  <div className="font-serif text-base sm:text-[17px] leading-[1.8] text-ink">
                    {group.sharedOptions.map((option, idx) => (
                      <span key={option.label}>
                        <strong className="font-bold text-ink">{option.label}</strong> {option.text}
                        {idx < (group.sharedOptions?.length ?? 0) - 1 ? ' · ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <ol className="flex flex-col gap-5">
                {group.questions.map((question) => {
                  const isCurrent = question.id === session.currentQuestion?.id;
                  return (
                    <li
                      key={question.id}
                      id={`question-${question.order}`}
                      tabIndex={-1}
                      className={cn(
                        'scroll-mt-4 rounded-base border-l-2 pl-3.5 py-0.5 outline-offset-4 transition-colors',
                        isCurrent ? 'border-primary' : 'border-line',
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-sm sm:text-base font-medium text-ink">
                          <span className="mono font-mono font-bold mr-2">{question.order}</span>
                          {question.prompt}
                        </div>
                        {/* The exam's own review tool, in the exam's own place:
                            beside the question, not buried in a menu. */}
                        <FlagToggle questionId={question.id} order={question.order} />
                      </div>
                      <QuestionRenderer question={question} group={group} disabled={session.expired} />
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
              <SkeletonLines lines={4} />
            </div>
          )
        }
        footer={
          <>
            <button
              type="button"
              onClick={session.previous}
              disabled={!session.canPrevious}
              className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-base border border-line-strong text-sm font-semibold text-ink hover:bg-sunken transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <QuestionNav
                questions={session.allQuestions.length > 0 ? session.allQuestions : session.questions}
                currentIndex={session.currentIndex}
                currentQuestionId={session.currentQuestion?.id}
                onSelect={jumpTo}
              />
            </div>
            <button
              type="button"
              onClick={session.next}
              disabled={!session.canNext}
              className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-base border border-line-strong text-sm font-semibold text-ink hover:bg-sunken transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </>
        }
        submit={{
          busy: submitting,
          title: 'Submit this test?',
          description: 'Your answers are marked immediately and cannot be changed afterwards.',
          warning: submitWarning,
          progress: 'Marking your answers…',
          error: submitError,
          onConfirm: () => void handleSubmit(),
        }}
      />
    </RendererProvider>
  );
}

/**
 * Loading and error chrome, shared by every skill's exam page.
 *
 * It asks for the two fields it actually reads rather than a whole
 * TestSession, so a skill running its own session hook gets the same gate
 * rather than a second copy of it.
 */
export function ExamGate({ session }: { session: { error: unknown; refetch: () => void } }) {
  if (session.error) {
    return (
      <ErrorState
        title="This test could not be opened"
        description={errorMessage(session.error)}
        onRetry={session.refetch}
      />
    );
  }
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-canvas animate-pulse" role="status" aria-label="Loading test">
      {/* Top chrome bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-40 sm:w-56" />
          <Skeleton className="h-5 w-16 rounded-pill" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-20 rounded-base" />
          <Skeleton className="h-8 w-24 rounded-base" />
        </div>
      </header>

      {/* Main split work surface */}
      <div className="flex flex-1 overflow-hidden p-4 sm:p-6 gap-6">
        {/* Left pane: Stimulus / passage */}
        <div className="flex-1 glass rounded-lg p-6 flex flex-col gap-4 overflow-hidden">
          <div className="flex justify-between items-center border-b border-line pb-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-20 rounded-pill" />
          </div>
          <div className="space-y-2.5 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="space-y-2.5 pt-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        {/* Right pane: Questions */}
        <div className="flex-1 glass rounded-lg p-6 flex flex-col gap-5 overflow-hidden">
          <div className="border-b border-line pb-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-2 h-3.5 w-64" />
          </div>
          <div className="space-y-4 pt-1">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="p-4 rounded-base border border-line bg-surface/50 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-8 rounded-base" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-9 w-full rounded-base" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer navigator */}
      <footer className="h-14 shrink-0 border-t border-line px-4 sm:px-6 flex items-center justify-between">
        <div className="flex gap-1.5 overflow-x-auto">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-base" />
          ))}
        </div>
        <Skeleton className="h-8 w-20 rounded-base" />
      </footer>
    </div>
  );
}
