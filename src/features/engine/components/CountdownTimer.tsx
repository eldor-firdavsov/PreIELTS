import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils/cn.ts';

/**
 * The exam clock.
 *
 * Monospace with tabular figures so the digits do not jitter as it runs.
 *
 * ── Urgency has to be more than a colour ──────────────────────────────────
 *
 * This used to turn red under five minutes and say nothing, with
 * `aria-live="off"` on the element. So the only signal that time was running
 * out was a colour: invisible to a screen reader, and unreliable for anyone
 * with a red-green deficiency. In a timed paper that is not a styling detail,
 * it is marks.
 *
 * Two changes. The label "5 min left" appears beside the digits, so the state
 * is carried by text as well as colour. And the remaining time is announced at
 * thresholds rather than continuously: ten minutes, five, two, one. A live
 * region on a ticking clock would read every second aloud and make the page
 * unusable, which is presumably why it was switched off in the first place.
 *
 * Red here means the same thing it means everywhere else in the app now: this
 * is going wrong. It is not the accent colour.
 */

/** Announced once each, as the clock passes them. */
const THRESHOLDS = [600, 300, 120, 60] as const;

const LOW_SECONDS = 300;

function spoken(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'} of your test time left.`;
}

export function CountdownTimer({ secondsRemaining }: { secondsRemaining: number | null }) {
  const [announcement, setAnnouncement] = useState('');
  const passed = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (secondsRemaining === null) return;
    const crossed = THRESHOLDS.find(
      (threshold) => secondsRemaining <= threshold && !passed.current.has(threshold),
    );
    if (crossed === undefined) return;
    // Everything above this threshold is now behind us: opening a paper with
    // four minutes left should say "5 minutes" once, not four times.
    for (const threshold of THRESHOLDS) {
      if (threshold >= crossed) passed.current.add(threshold);
    }
    setAnnouncement(spoken(crossed));
  }, [secondsRemaining]);

  if (secondsRemaining === null) {
    return <span className="font-mono text-sm text-ink-faint">--:--</span>;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const low = secondsRemaining <= LOW_SECONDS;
  const clock = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className="flex items-center gap-2">
      {/* Polite, and outside the timer, so a screen reader finishes the
          student's current sentence before it interrupts. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <span
        role="timer"
        aria-label={`Time remaining ${minutes} minutes ${seconds} seconds`}
        className={cn(
          'mono font-mono text-base sm:text-[20px] font-bold tracking-tight tabular-nums',
          low ? 'text-warn' : 'text-ink',
        )}
      >
        {clock}
      </span>

      {low && (
        <span className="hidden rounded-pill bg-warn-subtle px-2.5 py-0.5 text-xs font-semibold text-warn sm:inline">
          {minutes < 1 ? 'Under a min' : `${minutes + 1} min left`}
        </span>
      )}
    </span>
  );
}
