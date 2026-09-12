import { isAnswered, useAnswerStore } from '../answerStore.ts';
import { flattenQuestions, type Question, type SectionDefinition } from '../types.ts';
import { cn } from '../../../lib/utils/cn.ts';

export interface QuestionNavProps {
  /** The sections of the test. When provided, renders the official IELTS section layout. */
  sections?: SectionDefinition[];
  activeSectionIndex?: number;
  onSelectSection?: (index: number) => void;
  partLabel?: (order: number) => string;

  /** Flat list of questions (fallback if sections not provided) */
  questions?: Question[];
  currentIndex?: number;
  currentQuestionId?: string;
  onSelect: (indexOrId: number | string) => void;
}

/**
 * The official computer-delivered IELTS bottom navigation bar.
 *
 * Active section expands to display its label and question numbers directly inline:
 *   Part 1  [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] [ 6 ] [ 7 ] [ 8 ] [ 9 ] [ 10 ]
 * Inactive sections display their label and completion count:
 *   Part 2  0 of 10      Part 3  0 of 10      Part 4  0 of 10
 *
 * Clicking an inactive section switches to that section, expanding its question boxes.
 */
export function QuestionNav({
  sections,
  activeSectionIndex = 0,
  onSelectSection,
  partLabel,
  questions = [],
  currentIndex,
  currentQuestionId,
  onSelect,
}: QuestionNavProps) {
  const answers = useAnswerStore((state) => state.answers);
  const flagged = useAnswerStore((state) => state.flagged);

  // When sections are provided, render the official IELTS section layout
  if (sections && sections.length > 0) {
    const allSecQuestions = sections.flatMap((s) => flattenQuestions(s));
    const flaggedCount = allSecQuestions.filter((q) => flagged[q.id]).length;
    const firstFlagged = allSecQuestions.find((q) => flagged[q.id]);

    return (
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <nav
          aria-label="Test sections and questions"
          className="flex min-w-0 flex-1 items-center gap-8 sm:gap-10 overflow-x-auto py-1 px-1"
        >
          {sections.map((sec, secIndex) => {
            const isActive = secIndex === activeSectionIndex;
            const secQuestions = flattenQuestions(sec);
            const totalInSec = secQuestions.length;
            const answeredInSec = secQuestions.filter(
              (q) => isAnswered(answers[q.id]?.value ?? null),
            ).length;
            const label = partLabel ? partLabel(sec.order) : `Part ${sec.order}`;

            if (isActive) {
              return (
                <div key={sec.id} className="flex items-center gap-3 shrink-0">
                  <span className="font-heading font-bold text-ink text-sm sm:text-[15px] select-none shrink-0 tracking-tight">
                    {label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {secQuestions.map((question, qIdx) => {
                      const isCurrent = currentQuestionId
                        ? question.id === currentQuestionId
                        : qIdx === currentIndex;
                      const answered = isAnswered(answers[question.id]?.value ?? null);
                      const isFlg = flagged[question.id] === true;

                      return (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() => onSelect(question.id)}
                          aria-current={isCurrent ? 'true' : undefined}
                          aria-label={`Question ${question.order}${answered ? ', answered' : ', not answered'}${isFlg ? ', flagged' : ''}`}
                          className={cn(
                            'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-xs sm:text-[13px] font-mono font-bold transition-all select-none',
                            isCurrent
                              ? 'bg-[#2563eb] text-white font-bold border border-[#2563eb] shadow-xs'
                              : 'border border-[#d1d5db] bg-white text-ink hover:border-ink hover:text-ink dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-200',
                          )}
                        >
                          <span
                            className={cn(
                              answered && !isCurrent && 'underline decoration-2 underline-offset-2 font-semibold',
                            )}
                          >
                            {question.order}
                          </span>
                          {/* Corner flag marker */}
                          {isFlg && (
                            <span
                              aria-hidden="true"
                              className="absolute -right-px -top-px h-2.5 w-2.5 bg-amber-500 [clip-path:polygon(100%_0,100%_100%,0_0)]"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Inactive section
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelectSection?.(secIndex)}
                className="group flex items-center gap-2 px-1 py-1 text-sm cursor-pointer shrink-0 select-none"
                title={`Switch to ${label}`}
              >
                <span className="font-heading font-bold text-ink group-hover:text-primary transition-colors text-sm sm:text-[15px]">
                  {label}
                </span>
                <span className="font-normal text-neutral-500 dark:text-neutral-400 text-xs sm:text-sm">
                  {answeredInSec} of {totalInSec}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Flagged review shortcut */}
        {flaggedCount > 0 && firstFlagged && (
          <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
            <button
              type="button"
              onClick={() => onSelect(firstFlagged.id)}
              className="shrink-0 rounded-pill border border-warn/40 bg-warn-subtle px-3 py-1 text-2xs font-medium text-warn transition-colors hover:border-warn"
            >
              Flagged ({flaggedCount})
            </button>
          </div>
        )}
      </div>
    );
  }

  // Fallback flat questions navigation
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id]?.value ?? null)).length;
  const flaggedCount = questions.filter((q) => flagged[q.id]).length;
  const firstFlagged = questions.find((q) => flagged[q.id]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <nav
        aria-label={`Questions, ${answeredCount} of ${questions.length} answered`}
        className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1"
      >
        {questions.map((question, index) => {
          const answered = isAnswered(answers[question.id]?.value ?? null);
          const isFlg = flagged[question.id] === true;
          const current = currentQuestionId
            ? question.id === currentQuestionId
            : index === currentIndex;

          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onSelect(question.id)}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-xs sm:text-[13px] font-mono font-bold transition-all select-none',
                current
                  ? 'bg-[#2563eb] text-white font-bold border border-[#2563eb] shadow-xs'
                  : 'border border-[#d1d5db] bg-white text-ink hover:border-ink hover:text-ink dark:border-white/20 dark:bg-neutral-800 dark:text-neutral-200',
              )}
            >
              <span className={cn(answered && !current && 'underline decoration-2 underline-offset-2 font-semibold')}>
                {question.order}
              </span>
              {isFlg && (
                <span
                  aria-hidden="true"
                  className="absolute -right-px -top-px h-2.5 w-2.5 bg-amber-500 [clip-path:polygon(100%_0,100%_100%,0_0)]"
                />
              )}
            </button>
          );
        })}
      </nav>
      {flaggedCount > 0 && firstFlagged && (
        <button
          type="button"
          onClick={() => onSelect(firstFlagged.id)}
          className="hidden shrink-0 rounded-pill border border-warn/40 bg-warn-subtle px-3 py-1 text-2xs font-medium text-warn transition-colors hover:border-warn lg:flex"
        >
          Flagged ({flaggedCount})
        </button>
      )}
    </div>
  );
}
