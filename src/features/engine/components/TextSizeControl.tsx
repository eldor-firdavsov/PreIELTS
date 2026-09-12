import { useEffect, useState } from 'react';
import { applyTextSize, readTextSize, TEXT_SIZES, type TextSize } from '../../../lib/theme.ts';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * The exam's text-size control, in the exam's own chrome.
 *
 * Three sizes, the same choice the computer-delivered IELTS offers before a
 * paper starts. A radiogroup rather than a cycling button, so the student can
 * see the options and land on one directly instead of pressing until it looks
 * right.
 *
 * It sits in the exam header rather than in account settings because that is
 * where it is needed: halfway through a passage, on a monitor that is not
 * theirs.
 */
export function TextSizeControl({ className }: { className?: string }) {
  const [size, setSize] = useState<TextSize>('standard');

  useEffect(() => setSize(readTextSize()), []);

  function pick(next: TextSize) {
    setSize(next);
    applyTextSize(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Text size"
      className={cn('inline-flex items-center rounded-pill border border-line-strong bg-sunken overflow-hidden p-0.5', className)}
    >
      {TEXT_SIZES.map((option, index) => {
        const selected = size === option.value;
        return (
          <label
            key={option.value}
            title={option.label}
            className={cn(
              'flex cursor-pointer items-center justify-center rounded-pill px-3 py-0.5',
              'font-semibold transition-colors select-none',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
              'has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
              selected ? 'bg-surface text-ink shadow-rest' : 'text-ink-muted hover:text-ink',
            )}
          >
            <input
              type="radio"
              name="exam-text-size"
              value={option.value}
              checked={selected}
              onChange={() => pick(option.value)}
              className="sr-only"
            />
            {/* The glyph is the control: an A that grows with what it sets. */}
            <span
              aria-hidden="true"
              style={{ fontSize: `${0.75 + index * 0.15}rem` }}
              className="leading-none"
            >
              A
            </span>
            <span className="sr-only">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
