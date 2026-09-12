import { formatDuration } from '../../../lib/utils/format.ts';
import type { ResultOverview, ResultSkillBand } from '../services/resultsService.ts';

/**
 * SPEC.md §8 headline figures. Every value is read straight from the view; the
 * only thing this component does is choose the words around them.
 *
 * Every paper the product marks has an answer key, so every tile here has a
 * real number behind it. A tile with nothing behind it is omitted rather than
 * shown as a zero, because "0 / 0" reads as a score and is not one.
 */
export function ScoreSummary({
  overview,
  skill,
  skillName,
}: {
  overview: ResultOverview;
  skill: ResultSkillBand | undefined;
  /** How to describe what the band is for: "Reading", "Listening", "Full mock". */
  skillName: string;
}) {
  const band = skill?.band ?? overview.overall_band;

  return (
    <section className="glass overflow-hidden rounded-lg">
      <div className="flex flex-wrap gap-px bg-border">
        {/* Estimated band */}
        <div className="flex-[1.3_1_210px] bg-surface p-4 sm:p-[18px]">
          <div className="lbl">Estimated band</div>
          <div className="mono font-mono text-3xl sm:text-[40px] font-semibold leading-[1.05] mt-1 text-ink whitespace-nowrap">
            {band !== null && band !== undefined ? band.toFixed(1) : '—'}
          </div>
          <div className="text-xs sm:text-[13px] text-ink-muted mt-1">
            {`${skillName}, over the whole paper`}
          </div>
        </div>

        {/* Raw score */}
        <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
          <div className="lbl">Raw score</div>
          <div className="mono font-mono text-2xl sm:text-[31px] font-semibold leading-[1.1] mt-1.5 text-ink whitespace-nowrap">
            {overview.raw_score !== null && overview.raw_total !== null
              ? `${overview.raw_score} / ${overview.raw_total}`
              : '—'}
          </div>
        </div>

        {/* Percentage */}
        <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
          <div className="lbl">Percentage</div>
          <div className="mono font-mono text-2xl sm:text-[31px] font-semibold leading-[1.1] mt-1.5 text-ink whitespace-nowrap">
            {overview.percent_correct !== null ? `${overview.percent_correct}%` : '—'}
          </div>
        </div>

        {/* Total time */}
        <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
          <div className="lbl">Total time</div>
          <div className="mono font-mono text-2xl sm:text-[31px] font-semibold leading-[1.1] mt-1.5 text-ink whitespace-nowrap">
            {formatDuration(overview.total_time_seconds)}
          </div>
        </div>

        {/* Avg per question */}
        <div className="flex-[1_1_170px] bg-surface p-4 sm:p-[18px]">
          <div className="lbl">Avg per question</div>
          <div className="mono font-mono text-2xl sm:text-[31px] font-semibold leading-[1.1] mt-1.5 text-ink whitespace-nowrap">
            {formatDuration(overview.avg_seconds_per_question)}
          </div>
        </div>
      </div>
    </section>
  );
}
