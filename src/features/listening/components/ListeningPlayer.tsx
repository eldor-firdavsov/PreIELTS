import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { signAudioUrl } from '../../engine/index.ts';
import { EmptyState, ErrorState, Skeleton, errorMessage } from '../../../design-system/index.ts';

function clock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function ListeningPlayer({
  audioPath,
  startedAt: _startedAt,
  expired,
}: {
  audioPath: string | null;
  startedAt?: string | null;
  expired: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const source = useQuery({
    queryKey: ['listening-audio', audioPath],
    queryFn: () => signAudioUrl(audioPath as string),
    enabled: audioPath !== null,
    staleTime: 30 * 60 * 1000,
  });

  // Keep playback rate in sync with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Keep volume & muted in sync with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Stop playback when the test expires
  useEffect(() => {
    if (expired && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [expired]);

  const togglePlay = useCallback(async () => {
    const element = audioRef.current;
    if (!element) return;
    setPlaybackError(null);

    if (element.paused) {
      try {
        await element.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn('Play error:', err);
        setPlaybackError(errorMessage(err) || 'Playback could not start. Please try clicking Play again.');
      }
    } else {
      element.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeekChange = useCallback((newTime: number) => {
    const element = audioRef.current;
    const boundedTime = Math.max(0, Math.min(newTime, duration ?? newTime));
    setPosition(boundedTime);
    if (element) {
      try {
        element.currentTime = boundedTime;
      } catch (err) {
        console.warn('Seek error:', err);
      }
    }
  }, [duration]);

  const skipTime = useCallback((deltaSeconds: number) => {
    const element = audioRef.current;
    if (!element) return;
    const current = element.currentTime;
    const max = duration ?? current + deltaSeconds;
    const target = Math.max(0, Math.min(current + deltaSeconds, max));
    handleSeekChange(target);
  }, [duration, handleSeekChange]);

  const handleSliderInput = (e: React.FormEvent<HTMLInputElement>) => {
    const value = parseFloat((e.currentTarget as HTMLInputElement).value);
    setSeekPreview(value);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setIsSeeking(false);
    setSeekPreview(null);
    handleSeekChange(value);
  };

  if (audioPath === null) {
    return (
      <div className="px-4 py-5 sm:px-6">
        <EmptyState
          title="This test has no recording"
          description="No audio was stored for this paper, so its questions cannot be answered by listening. Choose another listening test."
        />
      </div>
    );
  }

  const total = duration ?? null;
  const currentDisplayPosition = isSeeking && seekPreview !== null ? seekPreview : position;
  const progressPercent = total && total > 0 ? Math.min(100, Math.max(0, (currentDisplayPosition / total) * 100)) : 0;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center justify-between">
        <div className="lbl">Interactive Audio Player</div>
        {isPlaying ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Playing
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-ink-muted/10 px-2.5 py-0.5 text-xs font-semibold text-ink-muted border border-border-subtle">
            Paused
          </span>
        )}
      </div>

      {source.isLoading && <ListeningPlayerSkeleton />}

      {source.error && (
        <ErrorState
          title="The recording could not be loaded"
          description={errorMessage(source.error)}
          onRetry={() => void source.refetch()}
        />
      )}

      {source.data && (
        <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-lift flex flex-col gap-4.5">
          <audio
            ref={audioRef}
            src={source.data}
            preload="auto"
            playsInline
            onLoadedMetadata={(event) => {
              const dur = event.currentTarget.duration;
              if (dur && isFinite(dur)) {
                setDuration(dur);
              }
            }}
            onTimeUpdate={(event) => {
              if (!isSeeking) {
                setPosition(event.currentTarget.currentTime);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => {
              setIsPlaying(false);
            }}
            onError={(e) => {
              const mediaErr = e.currentTarget.error;
              console.error('Audio load error:', mediaErr);
              setPlaybackError('The recording could not be loaded.');
            }}
          />

          {/* Time and Duration display */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="mono font-mono text-3xl font-bold text-ink tracking-tight leading-none">
                {clock(currentDisplayPosition)}
              </span>
              {isSeeking && (
                <span className="text-xs font-medium text-primary-solid animate-pulse">
                  (Seeking...)
                </span>
              )}
            </div>
            <div className="mono font-mono text-sm font-medium text-ink-muted">
              {`of ${total === null ? '--:--' : clock(total)}`}
            </div>
          </div>

          {/* Interactive Scrubbing Slider / Swiper */}
          <div className="relative flex flex-col gap-1 py-1" ref={progressBarRef}>
            <div className="relative w-full h-3 flex items-center group cursor-pointer">
              {/* Track background */}
              <div className="absolute inset-x-0 h-2 rounded-pill bg-sunken overflow-hidden transition-all duration-150 group-hover:h-2.5">
                <div
                  className="h-full bg-primary transition-all duration-75 rounded-pill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Native range input overlay for seamless drag/touch/swipe on all devices */}
              <input
                type="range"
                min={0}
                max={total ?? 100}
                step={0.1}
                value={currentDisplayPosition}
                onMouseDown={() => setIsSeeking(true)}
                onTouchStart={() => setIsSeeking(true)}
                onInput={handleSliderInput}
                onChange={handleSliderChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-label="Seek audio playback time"
              />

              {/* Custom Thumb indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white dark:bg-slate-100 border-2 border-primary shadow-md pointer-events-none transition-transform duration-100 group-hover:scale-125"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] font-mono text-ink-muted/80 px-0.5">
              <span>00:00</span>
              <span>{total !== null ? clock(total) : '--:--'}</span>
            </div>
          </div>

          {/* Transport & Control Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-glass-bd">
            {/* Play/Pause & Skip Buttons */}
            <div className="flex items-center gap-2">
              {/* Skip Back 10s */}
              <button
                type="button"
                onClick={() => skipTime(-10)}
                title="Rewind 10 seconds"
                aria-label="Rewind 10 seconds"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-bd/80 bg-surface/60 backdrop-blur-md text-ink hover:bg-surface/90 hover:text-ink transition-colors active:scale-95"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
                </svg>
                <span className="sr-only">Rewind 10s</span>
              </button>

              {/* Main Play / Pause Button */}
              <button
                type="button"
                onClick={() => void togglePlay()}
                title={isPlaying ? 'Pause recording' : 'Play recording'}
                aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
                className="inline-flex h-11 px-5 items-center justify-center gap-2 rounded-xl bg-primary text-white font-semibold hover:bg-primary-hover active:scale-[0.98] transition-all shadow-sm"
              >
                {isPlaying ? (
                  <>
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>Play</span>
                  </>
                )}
              </button>

              {/* Skip Forward 10s */}
              <button
                type="button"
                onClick={() => skipTime(10)}
                title="Forward 10 seconds"
                aria-label="Forward 10 seconds"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-bd/80 bg-surface/60 backdrop-blur-md text-ink hover:bg-surface/90 hover:text-ink transition-colors active:scale-95"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M11.5 8c2.65 0 5.05.99 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.2-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/>
                </svg>
                <span className="sr-only">Forward 10s</span>
              </button>
            </div>

            {/* Speed & Volume Tools */}
            <div className="flex items-center gap-2.5">
              {/* Playback Rate Selector */}
              <div className="flex items-center rounded-xl border border-glass-bd/80 bg-surface/60 backdrop-blur-md p-0.5 text-xs font-medium">
                {[0.75, 1, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`rounded-lg px-2 py-1 transition-colors ${
                      playbackRate === rate
                        ? 'bg-primary text-white font-semibold shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Volume / Mute Control with Mini Slider */}
              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-bd/80 bg-surface/60 backdrop-blur-md text-ink-muted hover:text-ink transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <svg className="w-4 h-4 fill-current text-danger" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                  )}
                </button>

                {showVolumeSlider && (
                  <div
                    onMouseLeave={() => setShowVolumeSlider(false)}
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass-panel rounded-xl p-2 shadow-float z-20 flex flex-col items-center gap-1"
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setVolume(val);
                        if (val > 0) setIsMuted(false);
                      }}
                      className="w-20 h-1 accent-primary cursor-pointer"
                      aria-label="Volume slider"
                    />
                    <span className="text-[10px] font-mono text-ink-muted">
                      {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {playbackError && (
            <div className="rounded-xl p-3 border border-danger/30 bg-danger/5 flex items-center justify-between gap-3 text-xs text-danger">
              <span>{playbackError}</span>
              <button
                type="button"
                onClick={() => void togglePlay()}
                className="underline font-semibold hover:text-danger/80"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ListeningPlayerSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading audio player"
      className="glass-panel rounded-2xl p-5 sm:p-6 shadow-lift flex flex-col gap-4.5"
    >
      {/* Time and Duration display */}
      <div className="flex items-baseline justify-between gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Interactive Scrubbing Slider */}
      <div className="flex flex-col gap-1 py-1">
        <div className="relative w-full h-3 flex items-center">
          <Skeleton className="w-full h-2 rounded-pill" />
        </div>
        <div className="flex justify-between text-[11px] font-mono px-0.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>

      {/* Transport & Control Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border-subtle/50">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>

        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-7 w-8 rounded-lg hidden sm:block" />
        </div>
      </div>
    </div>
  );
}
