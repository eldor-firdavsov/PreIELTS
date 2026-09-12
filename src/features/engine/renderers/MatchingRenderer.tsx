import type { QuestionRendererProps } from '../QuestionRenderer.tsx';
import { Select } from '../../../design-system/index.ts';

/**
 * Pick a letter or numeral for a prompt. Backs matching_headings,
 * matching_information and map_labelling. Options come from the question when
 * the source gave a per-question list, and otherwise from the group's shared
 * list.
 *
 * Shared by reading and listening, so it lives in the engine. See
 * ChoiceRenderer for why.
 */
export function MatchingRenderer({ question, group, value, onChange, disabled }: QuestionRendererProps) {
  const source = question.options ?? group.sharedOptions ?? [];
  const options = source.map((option) => ({
    value: option.label,
    label: option.text && option.text !== option.label ? `${option.label} — ${option.text}` : option.label,
  }));

  return (
    <Select
      // The prompt sits directly above; repeating it visibly would say it
      // twice, and omitting it from the accessible name would say it none.
      label={`Question ${question.order}. ${question.prompt}`}
      labelHidden
      options={options}
      placeholder="Choose"
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      disabled={disabled}
      emptyLabel="No options provided for this question"
      className="max-w-xs"
    />
  );
}
