import { isAnswered, useAnswerStore } from '../answerStore.ts';
import type { Question } from '../types.ts';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * The numbered strip along the bottom. Answered, unanswered and current are the
 * three states a candidate needs, and nothing else is encoded here.
 */
export function QuestionNav({
  questions,
  currentIndex,
  currentQuestionId,
  onSelect,
}: {
  questions: Question[];
  currentIndex?: number;
  currentQuestionId?: string;
  onSelect: (indexOrId: number | string) => void;
}) {
  const answers = useAnswerStore((state) => state.answers);
  const flagged = useAnswerStore((state) => state.flagged);
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id]?.value ?? null)).length;
  const firstUnanswered = questions.find((q) => !isAnswered(answers[q.id]?.value ?? null));
  const flaggedCount = questions.filter((q) => flagged[q.id]).length;
  const firstFlagged = questions.find((q) => flagged[q.id]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {/* Scrolls on a phone rather than wrapping into multiple rows */}
      <nav
        aria-label={`Questions, ${answeredCount} of ${questions.length} answered`}
        className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1"
      >
        {questions.map((question, index) => {
          const answered = isAnswered(answers[question.id]?.value ?? null);
          const isFlagged = flagged[question.id] === true;
          const current = currentQuestionId
            ? question.id === currentQuestionId
            : index === currentIndex;
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(question.id)}
              aria-current={current ? 'true' : undefined}
              aria-label={[
                `Question ${question.order}`,
                answered ? 'answered' : 'not answered',
                isFlagged ? 'flagged for review' : null,
              ]
                .filter(Boolean)
                .join(', ')}
              className={cn(
                'tn relative flex h-[34px] w-[34px] shrink-0 items-center justify-center',
                'rounded-base text-[13px] transition-colors',
                current
                  ? 'border-2 border-primary bg-primary-subtle font-bold text-primary'
                  : answered
                    ? 'bg-primary font-semibold text-white'
                    : 'border border-line-strong bg-transparent text-ink-muted hover:border-ink hover:text-ink',
              )}
            >
              {question.order}
              {/* Not colour alone: bottom dot on answered questions */}
              {answered && !current && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-[3px] w-[3px] rounded-full bg-white"
                />
              )}
              {/* The flag corner, so a flagged question reads as flagged */}
              {isFlagged && (
                <span
                  aria-hidden="true"
                  className="absolute -right-px -top-px h-2.5 w-2.5 bg-warn [clip-path:polygon(100%_0,100%_100%,0_0)]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Flagged & Unanswered jump shortcuts */}
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {flaggedCount > 0 && firstFlagged && (
          <button
            type="button"
            onClick={() => onSelect(firstFlagged.id)}
            className={cn(
              'shrink-0 rounded-pill border border-warn/40 bg-warn-subtle px-3 py-1.5',
              'text-2xs font-medium text-warn transition-colors hover:border-warn',
            )}
          >
            {`Flagged (${flaggedCount})`}
          </button>
        )}
        {firstUnanswered && (
          <button
            type="button"
            onClick={() => onSelect(firstUnanswered.id)}
            className={cn(
              'shrink-0 rounded-pill border border-line px-3 py-1.5 text-2xs font-medium',
              'text-ink-muted transition-colors hover:border-line-strong hover:text-ink',
            )}
          >
            {`Unanswered (${questions.length - answeredCount})`}
          </button>
        )}
      </div>
    </div>
  );
}
