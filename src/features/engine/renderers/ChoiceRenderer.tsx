import type { QuestionRendererProps } from '../QuestionRenderer.tsx';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * Single-answer pick from a fixed list. Backs multiple_choice,
 * true_false_not_given and yes_no_not_given: the interaction is identical and
 * only the option list differs, which comes from the content.
 *
 * Lives in the engine rather than in a feature because it is content-agnostic —
 * it knows a question type, not a passage or a recording — and reading and
 * listening both need it. A feature may not import another feature, so the
 * shared thing is promoted here and each feature composes its own registry.
 */
export function ChoiceRenderer({ question, value, onChange, disabled }: QuestionRendererProps) {
  const options = question.options ?? [];
  const selected = typeof value === 'string' ? value : null;

  if (options.length === 0) {
    return <p className="text-sm text-ink-muted">This question has no options to choose from.</p>;
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1.5">
      <legend className="sr-only">{`Question ${question.order}`}</legend>
      {options.map((option) => {
        const isSelected = selected === option.label;
        return (
          <label
            key={option.label}
            className={cn(
              'flex min-h-11 cursor-pointer items-start gap-3 rounded-base border px-3.5 py-2.5 text-sm transition-colors',
              isSelected ? 'border-primary bg-primary-subtle' : 'border-line bg-surface hover:border-line-strong hover:bg-sunken',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              value={option.label}
              checked={isSelected}
              onChange={() => onChange(option.label)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span className="text-ink">
              <span className="font-medium">{option.label}</span>
              {option.text && option.text !== option.label && <span>{`  ${option.text}`}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
