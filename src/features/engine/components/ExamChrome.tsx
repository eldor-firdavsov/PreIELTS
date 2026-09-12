import { useId, useState, type ReactNode } from 'react';
import { Button, Dialog, ProgressBar } from '../../../design-system/index.ts';
import { cn } from '../../../lib/utils/cn.ts';
import { CountdownTimer } from './CountdownTimer.tsx';
import { TextSizeControl } from './TextSizeControl.tsx';

/**
 * The exam chrome every skill shares — one header, one row of part tabs, two
 * panes, one optional footer, one submit confirmation.
 *
 * This exists because each skill had grown its own copy of the same layout and
 * the copies had drifted apart. Only the two panes differ between skills now:
 * reading puts a passage and a question list in them, listening a player and
 * the same question list.
 *
 * ── Two panes, three widths ───────────────────────────────────────────────
 *
 * The split used to be unconditional, so on a 390px phone each pane was about
 * 190px and a reading passage was a column four words wide. It is now a real
 * responsive layout:
 *
 *   below lg   one pane at a time, chosen by a switcher above the content.
 *              Reading a passage and answering about it are two activities on
 *              a phone, and asking a student to do both through two slots is
 *              worse than asking them to tap between them.
 *   lg and up  side by side, the way the exam is actually sat.
 *   very wide  the pair is capped and centred, and each pane caps its own
 *              measure. A passage set on a 1500px line is not more generous
 *              than one set on 700px, it is harder to read.
 */

export interface ExamTab {
  id: string;
  label: string;
  /** Renders a tick. Used where a part can be reported as finished. */
  complete?: boolean;
}

export interface ExamSubmit {
  /** Disabled while work is outstanding and submitting would be premature. */
  disabled?: boolean;
  busy: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * What the student is about to leave behind: unanswered questions, flagged
   * ones. Shown before they confirm, never after.
   */
  warning?: string | null;
  /** Progress line shown inside the dialog while submitting. */
  progress?: ReactNode;
  /**
   * Countable steps behind that line, where the skill has them. A submit that
   * knows how many steps are left gives the student a bar that moves rather
   * than a spinner that cannot say how long is left.
   */
  progressStep?: { step: number; total: number };
  error?: string | null;
  onConfirm: () => void;
}

type Pane = 'stimulus' | 'main';

export function ExamChrome({
  title,
  headerExtra,
  secondsRemaining,
  tabs,
  activeIndex,
  onSelectTab,
  tabsNote,
  stimulus,
  main,
  footer,
  submit,
  paneLabels = { stimulus: 'Material', main: 'Questions' },
}: {
  title: string;
  /** Save status, or anything else that belongs beside the clock. */
  headerExtra?: ReactNode;
  secondsRemaining: number | null;
  tabs: ExamTab[];
  activeIndex: number;
  onSelectTab: (index: number) => void;
  /** A note pinned to the right of the tab row, e.g. the Task 2 weighting. */
  tabsNote?: ReactNode;
  /** Left pane: passage, player, task prompt, cue card. */
  stimulus: ReactNode;
  /** Right pane: questions, editor, recorder. */
  main: ReactNode;
  /** Optional bottom bar. Reading and listening put the question nav here. */
  footer?: ReactNode;
  submit: ExamSubmit;
  /** What this skill calls its two panes, for the narrow-screen switcher. */
  paneLabels?: { stimulus: string; main: string };
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pane, setPane] = useState<Pane>('stimulus');
  const stimulusId = useId();
  const mainId = useId();

  return (
    <div className="flex h-dvh flex-col bg-surface">
      {/* --------------------------------------------------------- header */}
      <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-glass-bd/80 bg-glass-strong backdrop-blur-2xl px-3 sm:gap-4 sm:px-5 shadow-xs">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</span>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/* The save indicator is prose and costs more room than it earns on a
              phone. The clock and the submit button are never dropped. */}
          <span className="hidden md:inline">{headerExtra}</span>
          <TextSizeControl className="hidden sm:inline-flex" />
          <CountdownTimer secondsRemaining={secondsRemaining} />
          <Button
            size="sm"
            className="min-h-[38px] px-4 font-semibold"
            onClick={() => setConfirmOpen(true)}
            disabled={submit.disabled || submit.busy}
          >
            Submit
          </Button>
        </div>
      </header>

      {/* ----------------------------------------------------------- tabs */}
      <div className="strip flex shrink-0 items-center gap-2 border-b border-glass-bd bg-glass-strong backdrop-blur-xl px-3 py-2 sm:px-4 overflow-x-auto">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(index)}
            aria-current={index === activeIndex ? 'true' : undefined}
            className={cn(
              'shrink-0 rounded-pill px-3.5 py-1.5 min-h-[34px] text-xs sm:text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]',
              index === activeIndex
                ? 'border border-primary/40 bg-primary-subtle text-primary shadow-xs'
                : 'border border-glass-bd bg-surface/50 text-ink-muted hover:border-ink/40 hover:text-ink hover:bg-surface/80',
            )}
          >
            {tab.label}
            {tab.complete && (
              <span className="ml-1.5 text-success" aria-label="recorded">✓</span>
            )}
          </button>
        ))}
        {tabsNote && (
          <span className="hidden shrink-0 text-xs text-ink-faint lg:inline ml-auto">{tabsNote}</span>
        )}
      </div>

      {/* ------------------------------------------- narrow-screen switcher */}
      {/*
        Two plain toggles rather than a tablist. A tablist implies arrow-key
        traversal and a labelled panel, and a control that announces itself as
        something it does not behave like is worse than one that claims less.
      */}
      <div className="flex shrink-0 gap-1 border-b border-glass-bd p-1.5 lg:hidden bg-glass-strong backdrop-blur-xl">
        {([
          ['stimulus', paneLabels.stimulus, stimulusId],
          ['main', paneLabels.main, mainId],
        ] as const).map(([value, label, id]) => (
          <button
            key={value}
            type="button"
            aria-pressed={pane === value}
            aria-controls={id}
            onClick={() => setPane(value)}
            className={cn(
              'min-h-11 flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2',
              pane === value
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------ two panes */}
      <div className="mx-auto flex min-h-0 w-full flex-1 lg:max-w-[120rem]">
        {/*
          Hidden by class, never by the `hidden` attribute. Assistive technology
          honours that attribute whatever the CSS says, so a `hidden` prop with
          a `lg:block` override would have left the passage visible on a desktop
          and invisible to a screen reader on the same screen.
        */}
        <div
          id={stimulusId}
          className={cn(
            'min-w-0 flex-1 overflow-y-auto overscroll-contain bg-reading',
            'lg:block lg:border-r lg:border-line',
            pane === 'stimulus' ? 'block' : 'hidden',
          )}
        >
          {stimulus}
        </div>
        <div
          id={mainId}
          className={cn(
            'min-w-0 flex-1 overflow-y-auto overscroll-contain lg:block bg-surface',
            pane === 'main' ? 'block' : 'hidden',
          )}
        >
          {main}
        </div>
      </div>

      {footer && (
        <footer
          className={cn(
            'flex shrink-0 items-center gap-3 border-t border-glass-bd bg-glass-strong backdrop-blur-xl px-3 py-2.5 sm:px-4',
            'pb-[max(0.6rem,env(safe-area-inset-bottom))]',
          )}
        >
          {footer}
        </footer>
      )}

      <Dialog
        open={confirmOpen}
        // A submit in flight must not be dismissed by a stray click: the
        // request is already with the server and closing would hide the result.
        onClose={() => (submit.busy ? undefined : setConfirmOpen(false))}
        title={submit.title}
        description={submit.description}
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={submit.busy}
            >
              {submit.cancelLabel ?? 'Keep working'}
            </Button>
            <Button size="sm" onClick={submit.onConfirm} loading={submit.busy} loadingLabel="Submitting">
              {submit.confirmLabel ?? 'Submit'}
            </Button>
          </>
        }
      >
        {!submit.busy && submit.warning && (
          <p className="rounded-base border border-warn/35 bg-warn-subtle px-3 py-2 text-sm text-warn">
            {submit.warning}
          </p>
        )}
        {submit.busy && submit.progress && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-muted" role="status" aria-live="polite">
              {submit.progress}
            </p>
            {submit.progressStep && (
              <ProgressBar
                step={submit.progressStep.step}
                total={submit.progressStep.total}
                label="Marking your paper"
              />
            )}
          </div>
        )}
        {submit.error && (
          <p className="text-sm text-danger" role="alert">{submit.error}</p>
        )}
      </Dialog>
    </div>
  );
}
