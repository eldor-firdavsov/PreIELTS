import { useAnswerStore } from '../answerStore.ts';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * "Come back to this one."
 *
 * The computer-delivered IELTS gives every question a flag and surfaces the
 * flagged ones in the strip along the bottom of the screen. It is the tool
 * candidates actually use to manage a paper: answer what you can, mark what you
 * are unsure of, and spend the last few minutes on the marks you left behind.
 * This platform had no equivalent, so a student practising here arrived in the
 * exam room meeting the control for the first time.
 *
 * It is a toggle button rather than the exam's checkbox, because a checkbox
 * beside an answer field reads as part of the answer. `aria-pressed` carries
 * the state, and the label says what pressing it will do.
 */
export function FlagToggle({ questionId, order }: { questionId: string; order: number }) {
  const flagged = useAnswerStore((state) => state.flagged[questionId] === true);
  const toggleFlag = useAnswerStore((state) => state.toggleFlag);

  return (
    <button
      type="button"
      aria-pressed={flagged}
      aria-label={
        flagged
          ? `Question ${order} is flagged for review. Remove the flag.`
          : `Flag question ${order} to review later.`
      }
      onClick={() => toggleFlag(questionId)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1 min-h-[32px]',
        'text-xs font-semibold transition-colors',
        flagged
          ? 'border-warn bg-warn-subtle text-warn hover:border-warn'
          : 'border-line-strong text-ink-muted hover:border-ink hover:text-ink',
      )}
    >
      <span aria-hidden="true" className="text-[1.1em] leading-none">
        ⚑
      </span>
      {flagged ? 'Flagged' : 'Flag'}
    </button>
  );
}
