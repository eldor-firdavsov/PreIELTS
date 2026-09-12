import { useState } from 'react';
import { Badge, Button, ErrorState, Skeleton, SkeletonLines, errorMessage } from '../../../design-system/index.ts';
import { ANALYSIS_SECTIONS } from '../../../lib/ai/reading-analysis.ts';
import { LISTENING_ANALYSIS_SECTIONS } from '../../../lib/ai/listening-analysis.ts';
import { formatDuration } from '../../../lib/utils/format.ts';
import {
  analysableKind, readPassageEvidence, readTranscriptEvidence,
  type MistakeExplanation, type MistakeKind, type ResultMistake,
} from '../services/resultsService.ts';
import { useAudioUrl, useMistakeAnalysis, useSectionStimulus } from '../hooks/useResult.ts';
import type { Json } from '../../../lib/supabase/types.generated.ts';
import { cn } from '../../../lib/utils/cn.ts';

/** Answers are stored as jsonb: a string, an array for multi-select, or null. */
function formatAnswer(value: Json | null): string {
  if (value === null || value === undefined) return 'No answer';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'string') return value === '' ? 'No answer' : value;
  return String(value);
}

/**
 * SPEC.md §9. The ratio is computed in the view, so this states a stored fact
 * instead of re-deriving one, and it only speaks when there is something worth
 * saying.
 */
function TimeNote({ mistake }: { mistake: ResultMistake }) {
  const ratio = mistake.time_vs_average;
  if (ratio === null || mistake.time_spent_seconds === null) return null;

  if (ratio >= 1.5) {
    return (
      <p className="text-xs text-warn">
        {`You spent ${ratio.toFixed(1)}× your average on this question and still got it wrong.`}
      </p>
    );
  }
  if (ratio > 0 && ratio <= 0.4) {
    return (
      <p className="text-xs text-ink-muted">
        {`Answered in ${ratio.toFixed(1)}× your average time. Rushing may have cost the mark.`}
      </p>
    );
  }
  return null;
}

/**
 * "Play this moment" — loads the audio clip for the timestamp where this
 * question's answer appeared in the recording.
 */
function PlayMoment({ mistake }: { mistake: ResultMistake }) {
  const [open, setOpen] = useState(false);
  const evidence = readTranscriptEvidence(mistake.evidence);
  const stimulus = useSectionStimulus(open && evidence ? mistake.section_id : null);
  const audioPath = stimulus.data?.type === 'audio' ? stimulus.data.audioPath : null;
  const audio = useAudioUrl(open ? audioPath : null);

  if (!evidence) return null;

  const startAt = Math.max(0, evidence.time_seconds - 5);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide clip' : 'Play this moment'}
      </Button>
      {open && (
        <div className="rounded-base border border-line p-3 mt-1">
          {evidence.text && (
            <p className="font-serif text-sm text-ink mb-2">
              <mark className="rounded-sm bg-primary-subtle px-0.5 text-primary">{evidence.text}</mark>
            </p>
          )}
          {(stimulus.isLoading || audio.isLoading) && <SkeletonLines lines={1} />}
          {(stimulus.error || audio.error) && (
            <ErrorState
              description={errorMessage(stimulus.error ?? audio.error)}
              onRetry={() => { void stimulus.refetch(); void audio.refetch(); }}
            />
          )}
          {audio.data && (
            <audio controls preload="metadata" className="w-full" src={`${audio.data}#t=${startAt}`} />
          )}
          {!audio.isLoading && !audio.error && !audio.data && stimulus.data && !audioPath && (
            <p className="text-xs text-ink-muted">No recording stored for this section.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Show answer in passage" — highlights the relevant span inside the reading
 * passage. Only rendered for reading questions that have stored offsets.
 */
function ShowInPassage({ mistake }: { mistake: ResultMistake }) {
  const [open, setOpen] = useState(false);
  const evidence = readPassageEvidence(mistake.evidence);
  const stimulus = useSectionStimulus(open && evidence ? mistake.section_id : null);
  const passage = stimulus.data?.type === 'passage' ? stimulus.data.paragraphs : undefined;

  if (!evidence) return null;

  const paragraph = passage?.[evidence.paragraph_index];

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide passage' : 'Show in passage'}
      </Button>
      {open && (
        <div className="rounded-base border border-line bg-reading px-4 py-3 mt-1">
          {stimulus.isLoading && <SkeletonLines lines={3} />}
          {stimulus.error && (
            <ErrorState description={errorMessage(stimulus.error)} onRetry={() => void stimulus.refetch()} />
          )}
          {paragraph && (
            <p className="font-serif text-base text-ink leading-relaxed">
              {paragraph.label && <span className="mr-2 font-semibold text-ink-muted">{paragraph.label}</span>}
              {paragraph.text.slice(0, evidence.start)}
              <mark className="rounded-sm bg-primary-subtle px-0.5 font-medium text-primary">
                {paragraph.text.slice(evidence.start, evidence.end)}
              </mark>
              {paragraph.text.slice(evidence.end)}
            </p>
          )}
          {!stimulus.isLoading && !stimulus.error && !paragraph && (
            <p className="text-sm text-ink-muted">Location no longer matches this passage.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The explanation sections, rendered as clean prose.
 */
function readable(explanation: MistakeExplanation): Array<{ label: string; text: string }> {
  return explanation.kind === 'reading'
    ? ANALYSIS_SECTIONS.map(({ key, label }) => ({ label, text: explanation.analysis[key] }))
    : LISTENING_ANALYSIS_SECTIONS.map(({ key, label }) => ({ label, text: explanation.analysis[key] }));
}

/** "Why was I wrong?" — one button, loading on the button, clean output. */
function WhyWasIWrong({ mistakeId, kind }: { mistakeId: string; kind: MistakeKind }) {
  const [asked, setAsked] = useState(false);
  const { cached, generate } = useMistakeAnalysis(mistakeId, kind, asked);

  const explanation = generate.data?.explanation ?? cached.data?.explanation ?? null;
  const busy = cached.isLoading || generate.isPending;

  // Not yet asked — show the trigger button
  if (!asked) {
    return (
      <Button
        variant="primary"
        size="md"
        onClick={() => setAsked(true)}
      >
        Explain this mistake
      </Button>
    );
  }

  // Asked, loading — show loading state on the button and a placeholder skeleton card
  if (busy && !explanation) {
    return (
      <div className="flex flex-col gap-3 mt-2" role="status" aria-busy="true" aria-label="Analysing mistake">
        <div>
          <Button variant="primary" size="md" loading loadingLabel="Analysing…" disabled>Analysing…</Button>
        </div>
        <div className="rounded-base border border-line p-4 space-y-3.5">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="space-y-1.5 pt-2 border-t border-line/60">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (!explanation && generate.isError) {
    return (
      <div className="flex flex-col gap-2">
        <ErrorState
          title="Could not generate explanation"
          description={errorMessage(generate.error)}
          onRetry={() => generate.mutate()}
          retrying={generate.isPending}
        />
      </div>
    );
  }

  // No cached explanation found — offer to generate
  if (!explanation && !busy) {
    return (
      <Button
        variant="primary"
        size="md"
        onClick={() => generate.mutate()}
        loading={generate.isPending}
        loadingLabel="Analysing…"
      >
        Explain this mistake
      </Button>
    );
  }

  // Explanation ready — clean prose output
  if (!explanation) return null;

  return (
    <div className="flex flex-col gap-3 mt-2">
      <div className="lbl">Explanation</div>
      <div className="rounded-base border border-line p-4 space-y-3">
        {readable(explanation).map(({ label, text }) => (
          <div key={label}>
            <div className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-0.5">{label}</div>
            <p className="font-serif text-[15px] leading-relaxed text-ink max-w-[68ch]">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MistakeCard({ mistake }: { mistake: ResultMistake }) {
  const unanswered = mistake.user_answer === null;
  const listening = mistake.section_kind === 'listening';
  const kind = analysableKind(mistake.section_kind);

  return (
    <article className="glass overflow-hidden rounded-lg border border-line border-l-2 border-l-danger shadow-rest">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3 sm:px-[18px]">
        <span className="mono font-mono text-sm font-semibold text-ink">
          {mistake.question_ordinal ?? ''}
        </span>
        <Badge tone="primary">{(mistake.question_type ?? '').replace(/_/g, ' ')}</Badge>
        {unanswered && <Badge tone="warn">Not answered</Badge>}
        {mistake.section_title && (
          <span className="text-xs sm:text-sm text-ink-muted">{mistake.section_title}</span>
        )}
        <span className="ml-auto text-xs sm:text-[13px] text-ink-muted">
          {`Time: ${formatDuration(mistake.time_spent_seconds)}`}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4 sm:p-[18px]">
        {/* Question prompt */}
        <p className="font-serif text-base sm:text-[17px] text-ink leading-relaxed max-w-[68ch]">
          {mistake.prompt}
        </p>

        {/* Side-by-side answers */}
        <div className="flex flex-wrap gap-px bg-border border border-border rounded-base overflow-hidden max-w-[600px]">
          <div className="flex-1 min-w-[200px] bg-canvas p-3 sm:px-3.5 sm:py-3">
            <div className="lbl">Your answer</div>
            <div className={cn('text-sm font-semibold mt-0.5', unanswered ? 'text-ink-muted' : 'text-danger')}>
              {formatAnswer(mistake.user_answer)}
            </div>
          </div>
          <div className="flex-1 min-w-[200px] bg-canvas p-3 sm:px-3.5 sm:py-3">
            <div className="lbl">Correct answer</div>
            <div className="text-sm font-semibold text-success mt-0.5">
              {formatAnswer(mistake.correct_answer)}
            </div>
          </div>
        </div>

        <TimeNote mistake={mistake} />

        {/* Two buttons only: explain + play/show */}
        <div className="flex flex-wrap items-start gap-2 pt-1">
          {kind && mistake.mistake_id && (
            <WhyWasIWrong mistakeId={mistake.mistake_id} kind={kind} />
          )}
          {listening
            ? <PlayMoment mistake={mistake} />
            : <ShowInPassage mistake={mistake} />}
        </div>
      </div>
    </article>
  );
}
