import { useId } from 'react';
import { cn } from '../lib/utils/cn.ts';
import { SkeletonRegion } from './Skeleton.tsx';
import { EmptyState } from './EmptyState.tsx';
import { ErrorState } from './ErrorState.tsx';

export interface ChartPoint {
  /** Axis label, usually a date. */
  label: string;
  value: number;
}

interface ChartProps {
  points: ChartPoint[];
  /** Fixed scale, so a band chart always reads against the same 0-9 range. */
  min?: number;
  max?: number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

const VIEW_WIDTH = 520;
const VIEW_HEIGHT = 230;
const PAD_LEFT = 48;
const PAD_RIGHT = 24;
const PAD_TOP = 24;
const PAD_BOTTOM = 46;

/**
 * A single-series line chart drawn as inline SVG. Matches the Band layout
 * prototype with clean gridlines, monospace axes and primary accent points.
 */
export function Chart({
  points,
  min = 5.0,
  max = 9.0,
  loading = false,
  error,
  onRetry,
  emptyTitle = 'No results yet',
  emptyDescription = 'Your progress appears here once you have completed a test.',
  className,
}: ChartProps) {
  const chartId = useId();

  if (loading) {
    return (
      <SkeletonRegion label="Loading chart" className={cn('w-full', className)}>
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          role="img"
          aria-label="Loading chart"
          className="h-auto w-full max-h-64 opacity-50"
        >
          {/* Horizontal gridlines */}
          <g stroke="var(--border)" strokeWidth="1">
            {[40, 80, 120, 160].map((y) => (
              <line key={y} x1={PAD_LEFT - 4} y1={y} x2={VIEW_WIDTH - PAD_RIGHT} y2={y} />
            ))}
          </g>
          {/* Baseline */}
          <line
            x1={PAD_LEFT - 4}
            y1={PAD_TOP + (VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM)}
            x2={VIEW_WIDTH - PAD_RIGHT}
            y2={PAD_TOP + (VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM)}
            stroke="var(--border-strong)"
            strokeWidth="1"
          />
          {/* Simulated chart polyline skeleton */}
          <polyline
            points="50,150 140,130 230,110 320,85 410,70 490,60"
            fill="none"
            stroke="var(--skeleton)"
            strokeWidth="2.5"
            strokeDasharray="4 4"
            className="animate-pulse"
          />
          {/* Pulsing nodes */}
          {[
            [50, 150], [140, 130], [230, 110], [320, 85], [410, 70], [490, 60]
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="4" fill="var(--skeleton)" className="animate-pulse" />
          ))}
        </svg>
      </SkeletonRegion>
    );
  }
  if (error) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : 'The chart could not be loaded.'}
        onRetry={onRetry}
        className={className}
      />
    );
  }
  if (points.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const effectiveMin = Math.min(min, ...points.map((p) => p.value));
  const effectiveMax = Math.max(max, ...points.map((p) => p.value));
  const span = Math.max(effectiveMax - effectiveMin, 1);
  const plotWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = PAD_LEFT + (points.length > 1 ? index * step : plotWidth / 2);
    const clamped = Math.min(Math.max(point.value, effectiveMin), effectiveMax);
    const y = PAD_TOP + plotHeight - ((clamped - effectiveMin) / span) * plotHeight;
    return { x, y, point };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  // Y-axis gridlines at key levels
  const yTicks = [9.0, 8.0, 7.5, 7.0, 6.0, 5.0].filter(
    (val) => val >= effectiveMin && val <= effectiveMax,
  );

  return (
    <figure className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-labelledby={chartId}
        className="h-auto w-full max-h-64"
      >
        <title id={chartId}>
          {`Line chart of ${points.length} values, from ${points[0]?.label ?? ''} to ${points.at(-1)?.label ?? ''}`}
        </title>

        {/* Horizontal gridlines */}
        <g stroke="var(--border)" strokeWidth="1">
          {yTicks.map((tick) => {
            const y = PAD_TOP + plotHeight - ((tick - effectiveMin) / span) * plotHeight;
            return (
              <line
                key={tick}
                x1={PAD_LEFT - 4}
                y1={y}
                x2={VIEW_WIDTH - PAD_RIGHT}
                y2={y}
              />
            );
          })}
        </g>

        {/* Baseline */}
        <line
          x1={PAD_LEFT - 4}
          y1={PAD_TOP + plotHeight}
          x2={VIEW_WIDTH - PAD_RIGHT}
          y2={PAD_TOP + plotHeight}
          stroke="var(--border-strong)"
          strokeWidth="1"
        />

        {/* Y-axis Labels */}
        <g font-family="var(--font-mono)" fontSize="11" fill="var(--fg-muted)" textAnchor="end">
          {yTicks.map((tick) => {
            const y = PAD_TOP + plotHeight - ((tick - effectiveMin) / span) * plotHeight;
            return (
              <text key={tick} x={PAD_LEFT - 10} y={y + 4}>
                {tick.toFixed(1)}
              </text>
            );
          })}
        </g>

        {/* Data curve */}
        {points.length > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}

        {/* Data Points */}
        <g fill="var(--primary)">
          {coords.map((c) => (
            <circle
              key={c.point.label}
              cx={c.x}
              cy={c.y}
              r="4.5"
            />
          ))}
        </g>

        {/* X-axis date labels */}
        <g font-family="var(--font-mono)" fontSize="11" fill="var(--fg-muted)" textAnchor="middle">
          {coords.map((c) => (
            <text key={c.point.label} x={c.x} y={VIEW_HEIGHT - 12}>
              {c.point.label}
            </text>
          ))}
        </g>
      </svg>
    </figure>
  );
}
