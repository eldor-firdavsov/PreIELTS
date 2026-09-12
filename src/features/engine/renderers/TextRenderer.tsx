import type { QuestionRendererProps } from '../QuestionRenderer.tsx';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * Typed answer. Backs sentence_completion, summary_completion, short_answer,
 * note_completion and form_completion. Nothing is validated here: the word
 * limit is part of the instructions the student reads, and correctness is
 * decided by the database.
 *
 * Shared by reading and listening, so it lives in the engine. See
 * ChoiceRenderer for why.
 */
export function TextRenderer({ question, value, onChange, disabled }: QuestionRendererProps) {
  return (
    <input
      type="text"
      inputMode="text"
      autoComplete="off"
      spellCheck={false}
      // Named by the question, not by its number. A screen reader user tabs
      // between forty of these; "Answer for question 5" told them nothing and
      // sent them back out to the prompt on every one.
      aria-label={`Question ${question.order}. ${question.prompt}`}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      className={cn(
        'h-11 w-full max-w-sm rounded-base border border-line-strong bg-surface px-3 text-base text-ink sm:h-10 sm:text-sm',
        'transition-[border-color] hover:border-primary/50',
        'placeholder:text-ink-faint',
        'disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60',
      )}
      placeholder="Type your answer"
    />
  );
}
