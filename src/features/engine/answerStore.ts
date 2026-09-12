import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AnswerRecord, AnswerValue } from './types.ts';
import { upsertAnswers, type AnswerUpsert, type StoredAnswer } from './services/sessionService.ts';

/**
 * Answer state for the running session — docs/ARCHITECTURE.md §3.
 *
 * localStorage is the safety net, Postgres is the record. Every keystroke
 * writes to localStorage synchronously; the network write is debounced to 5
 * seconds and also forced on section change and on submit. Writing to Supabase
 * per keystroke would burn rate limits and still lose work on a dropped
 * connection, which is exactly the case that matters.
 *
 * A failed flush never clears the dirty set. The batch stays queued, retries on
 * a backoff, and retries immediately when the browser comes back online.
 */

export const FLUSH_DEBOUNCE_MS = 5_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;
const STORAGE_KEY = 'ieltsiq.answers';

export type FlushStatus = 'idle' | 'pending' | 'flushing' | 'error';

interface AnswerState {
  sessionId: string | null;
  answers: Record<string, AnswerRecord>;
  /**
   * Questions the student marked to come back to.
   *
   * The real computer-delivered IELTS gives every question a flag and shows the
   * flagged ones in the navigation strip along the bottom, and a candidate who
   * has practised here should meet the same tool in the exam room. It is
   * session-local on purpose: a flag is a note to yourself during the paper,
   * it has no meaning once the paper is marked, and `answers` has no column
   * for it. So it persists to localStorage with everything else and never
   * enters the dirty set, which means it never tries to reach Postgres.
   */
  flagged: Record<string, true>;
  /** Question ids written locally but not yet acknowledged by Postgres. */
  dirty: string[];
  status: FlushStatus;
  lastFlushedAt: number | null;
  lastError: string | null;

  /** Point the store at a session, seeding from the server then local state. */
  adoptSession: (sessionId: string, serverAnswers: StoredAnswer[]) => void;
  setAnswer: (questionId: string, value: AnswerValue) => void;
  toggleFlag: (questionId: string) => void;
  addTime: (questionId: string, seconds: number) => void;
  /** Internal: called by the flush controller. */
  applyFlushResult: (flushed: Array<{ questionId: string; updatedAt: number }>) => void;
  setStatus: (status: FlushStatus, error?: string | null) => void;
  reset: () => void;
}

const EMPTY: Pick<
  AnswerState,
  'sessionId' | 'answers' | 'flagged' | 'dirty' | 'status' | 'lastFlushedAt' | 'lastError'
> = {
  sessionId: null,
  answers: {},
  flagged: {},
  dirty: [],
  status: 'idle',
  lastFlushedAt: null,
  lastError: null,
};

export const useAnswerStore = create<AnswerState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      adoptSession: (sessionId, serverAnswers) => {
        const state = get();
        // A different session invalidates everything held locally.
        const local = state.sessionId === sessionId ? state.answers : {};
        const localDirty = state.sessionId === sessionId ? state.dirty : [];
        const localFlags = state.sessionId === sessionId ? state.flagged : {};

        const merged: Record<string, AnswerRecord> = {};
        for (const row of serverAnswers) {
          merged[row.question_id] = {
            value: row.value,
            timeSpentSeconds: row.time_spent_seconds,
            updatedAt: 0,
          };
        }
        // Local wins: it is written before the network call, so it is never older.
        for (const [questionId, record] of Object.entries(local)) {
          merged[questionId] = record;
        }
        set({
          sessionId,
          answers: merged,
          flagged: localFlags,
          dirty: localDirty,
          status: localDirty.length > 0 ? 'pending' : 'idle',
        });
      },

      setAnswer: (questionId, value) => {
        const state = get();
        const previous = state.answers[questionId];
        set({
          answers: {
            ...state.answers,
            [questionId]: {
              value,
              timeSpentSeconds: previous?.timeSpentSeconds ?? 0,
              updatedAt: Date.now(),
            },
          },
          dirty: state.dirty.includes(questionId) ? state.dirty : [...state.dirty, questionId],
          status: 'pending',
        });
        scheduleFlush();
      },

      toggleFlag: (questionId) => {
        const state = get();
        const next = { ...state.flagged };
        if (next[questionId]) delete next[questionId];
        else next[questionId] = true;
        // No scheduleFlush: a flag is never sent anywhere.
        set({ flagged: next });
      },

      addTime: (questionId, seconds) => {
        if (seconds <= 0) return;
        const state = get();
        const previous = state.answers[questionId];
        // Timing alone does not dirty the row; it rides along with the next
        // real answer change, which keeps idle pages off the network.
        set({
          answers: {
            ...state.answers,
            [questionId]: {
              value: previous?.value ?? null,
              timeSpentSeconds: (previous?.timeSpentSeconds ?? 0) + seconds,
              updatedAt: previous?.updatedAt ?? 0,
            },
          },
        });
      },

      applyFlushResult: (flushed) => {
        const state = get();
        // Only clear ids the student has not touched again since the snapshot.
        const stillDirty = state.dirty.filter((questionId) => {
          const sent = flushed.find((f) => f.questionId === questionId);
          if (!sent) return true;
          return (state.answers[questionId]?.updatedAt ?? 0) > sent.updatedAt;
        });
        set({
          dirty: stillDirty,
          status: stillDirty.length > 0 ? 'pending' : 'idle',
          lastFlushedAt: Date.now(),
          lastError: null,
        });
      },

      setStatus: (status, error = null) => set({ status, lastError: error }),

      reset: () => {
        cancelFlush();
        set({ ...EMPTY });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Transient flush bookkeeping is not worth persisting, but the dirty set
      // is: a refresh mid-flush must not forget what still owes the server.
      partialize: (state) => ({
        sessionId: state.sessionId,
        answers: state.answers,
        flagged: state.flagged,
        dirty: state.dirty,
      }),
      version: 2,
    },
  ),
);

/* ------------------------------------------------------------------ flush */

let timer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = RETRY_BASE_MS;
let inFlight: Promise<void> | null = null;

function cancelFlush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Debounce a flush. Repeated calls inside the window collapse into one. */
export function scheduleFlush(delayMs: number = FLUSH_DEBOUNCE_MS): void {
  cancelFlush();
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, delayMs);
}

/**
 * Send every dirty answer now. Used by the debounce, by section changes, by
 * submit, and by the reconnect listener. Concurrent calls share one request.
 */
export async function flushNow(): Promise<void> {
  if (inFlight) return inFlight;

  const state = useAnswerStore.getState();
  const { sessionId, dirty, answers } = state;
  if (!sessionId || dirty.length === 0) return;

  const snapshot: Array<{ questionId: string; updatedAt: number }> = [];
  const batch: AnswerUpsert[] = [];
  for (const questionId of dirty) {
    const record = answers[questionId];
    if (!record) continue;
    snapshot.push({ questionId, updatedAt: record.updatedAt });
    batch.push({ questionId, value: record.value, timeSpentSeconds: record.timeSpentSeconds });
  }
  if (batch.length === 0) return;

  cancelFlush();
  state.setStatus('flushing');

  inFlight = (async () => {
    try {
      await upsertAnswers(sessionId, batch);
      useAnswerStore.getState().applyFlushResult(snapshot);
      retryDelay = RETRY_BASE_MS;
      // An answer changed while this flush was in the air is still dirty, and
      // nothing else will notice: its scheduleFlush fired into the in-flight
      // promise and returned. Chase it, or the last answer touched sits
      // unsaved until the student happens to touch another.
      if (useAnswerStore.getState().dirty.length > 0) scheduleFlush(0);
    } catch (error) {
      // Keep the batch dirty. localStorage already holds it, so the work is
      // safe; all that is outstanding is the trip to Postgres.
      useAnswerStore
        .getState()
        .setStatus('error', error instanceof Error ? error.message : 'Could not save answers.');
      scheduleFlush(retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Call once at app start. Retries the queue the moment the network returns. */
export function installFlushListeners(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onOnline = (): void => {
    retryDelay = RETRY_BASE_MS;
    void flushNow();
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void flushNow();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/* ------------------------------------------------------------- selectors */

export function selectAnswer(questionId: string): (state: AnswerState) => AnswerValue {
  return (state) => state.answers[questionId]?.value ?? null;
}

export function isAnswered(value: AnswerValue): boolean {
  if (value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return value.trim() !== '';
}
