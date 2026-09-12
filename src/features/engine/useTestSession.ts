import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadTestDefinition } from './services/contentService.ts';
import { fetchAnswers, setCurrentSection, startOrResumeSession } from './services/sessionService.ts';
import { flushNow, installFlushListeners, useAnswerStore } from './answerStore.ts';
import { flattenQuestions, type Question, type SectionDefinition } from './types.ts';

/**
 * Owns the running session: timer, position, and the dirty-answer buffer's
 * lifecycle. Answer values themselves live in the Zustand store, because they
 * must survive this hook unmounting on a refresh.
 */

export interface TestSession {
  loading: boolean;
  error: unknown;
  refetch: () => void;

  sessionId: string | null;
  /**
   * When the session began, ISO. The countdown derives from this, and so does
   * listening playback: one instant governs both, so the clock and the tape can
   * never disagree and a refresh cannot rewind either.
   */
  startedAt: string | null;
  title: string;
  externalId: string | null;
  sections: SectionDefinition[];
  section: SectionDefinition | undefined;
  sectionIndex: number;
  /** Current section questions */
  questions: Question[];
  /** All questions across all sections of this paper (usually 40 questions) */
  allQuestions: Question[];
  currentQuestion: Question | undefined;
  currentIndex: number;

  canPrevious: boolean;
  canNext: boolean;

  /** Whole-test countdown, in seconds. Null until content has loaded. */
  secondsRemaining: number | null;
  expired: boolean;

  goToQuestion: (indexOrId: number | string) => void;
  next: () => void;
  previous: () => void;
  goToSection: (index: number) => Promise<void>;
}

export function useTestSession(testId: string): TestSession {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const adoptSession = useAnswerStore((state) => state.adoptSession);
  const addTime = useAnswerStore((state) => state.addTime);

  const content = useQuery({
    queryKey: ['test-definition', testId],
    queryFn: () => loadTestDefinition(testId),
    staleTime: Infinity,
  });

  const session = useQuery({
    queryKey: ['test-session', testId],
    queryFn: async () => {
      const row = await startOrResumeSession(testId);
      const answers = await fetchAnswers(row.id);
      return { row, answers };
    },
    staleTime: Infinity,
  });

  // Seed the store once the session and its server-side answers are known.
  useEffect(() => {
    if (!session.data) return;
    adoptSession(session.data.row.id, session.data.answers);
  }, [session.data, adoptSession]);

  useEffect(() => installFlushListeners(), []);

  const sections = useMemo(() => content.data?.sections ?? [], [content.data]);
  const section = sections[sectionIndex];
  const questions = useMemo(() => (section ? flattenQuestions(section) : []), [section]);
  const allQuestions = useMemo(() => sections.flatMap((s) => flattenQuestions(s)), [sections]);
  const currentQuestion = questions[currentIndex];

  // ------------------------------------------------------------- countdown
  // Derived from started_at, not from a local tick count, so a refresh cannot
  // hand the student extra time.
  const totalSeconds = useMemo(
    () => sections.reduce((sum, s) => sum + s.durationSeconds, 0),
    [sections],
  );
  const startedAt = session.data?.row.started_at;

  useEffect(() => {
    if (!startedAt || totalSeconds === 0) return;
    const startedMs = new Date(startedAt).getTime();
    const tick = (): void => {
      const elapsed = Math.floor((Date.now() - startedMs) / 1000);
      setSecondsRemaining(Math.max(0, totalSeconds - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, totalSeconds]);

  // --------------------------------------------------------- per-question time
  const questionIdRef = useRef<string | null>(null);
  const enteredAtRef = useRef<number>(Date.now());

  useEffect(() => {
    const previousId = questionIdRef.current;
    const now = Date.now();
    if (previousId && previousId !== currentQuestion?.id) {
      addTime(previousId, Math.round((now - enteredAtRef.current) / 1000));
    }
    if (previousId !== currentQuestion?.id) {
      questionIdRef.current = currentQuestion?.id ?? null;
      enteredAtRef.current = now;
    }
  }, [currentQuestion?.id, addTime]);

  // Bank the time spent on the last question when the test view goes away.
  useEffect(
    () => () => {
      const id = questionIdRef.current;
      if (id) addTime(id, Math.round((Date.now() - enteredAtRef.current) / 1000));
      void flushNow();
    },
    [addTime],
  );

  const goToSection = useCallback(
    async (index: number) => {
      const target = sections[index];
      if (!target) return;
      // Section change is a forced flush point, per §3.
      await flushNow();
      setSectionIndex(index);
      setCurrentIndex(0);
      const sessionId = session.data?.row.id;
      if (sessionId) {
        try {
          await setCurrentSection(sessionId, target.id);
        } catch {
          // Position is a convenience, not the record. Never block navigation.
        }
      }
    },
    [sections, session.data?.row.id],
  );

  const goToQuestion = useCallback(
    (indexOrId: number | string) => {
      if (typeof indexOrId === 'number') {
        if (indexOrId >= 0 && indexOrId < questions.length) {
          setCurrentIndex(indexOrId);
        }
        return;
      }
      // String question ID or question order match across all sections
      for (let sIdx = 0; sIdx < sections.length; sIdx++) {
        const sec = sections[sIdx];
        if (!sec) continue;
        const sQuestions = flattenQuestions(sec);
        const qIdx = sQuestions.findIndex((q) => q.id === indexOrId || String(q.order) === indexOrId);
        if (qIdx >= 0) {
          if (sIdx !== sectionIndex) {
            void goToSection(sIdx).then(() => {
              setCurrentIndex(qIdx);
            });
          } else {
            setCurrentIndex(qIdx);
          }
          return;
        }
      }
    },
    [questions.length, sections, sectionIndex, goToSection],
  );

  const next = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((idx) => idx + 1);
    } else if (sectionIndex < sections.length - 1) {
      void goToSection(sectionIndex + 1);
    }
  }, [currentIndex, questions.length, sectionIndex, sections.length, goToSection]);

  const previous = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((idx) => idx - 1);
    } else if (sectionIndex > 0) {
      const prevSection = sections[sectionIndex - 1];
      const prevQuestions = prevSection ? flattenQuestions(prevSection) : [];
      void goToSection(sectionIndex - 1).then(() => {
        if (prevQuestions.length > 0) {
          setCurrentIndex(prevQuestions.length - 1);
        }
      });
    }
  }, [currentIndex, sectionIndex, sections, goToSection]);

  return {
    loading: content.isLoading || session.isLoading,
    error: content.error ?? session.error,
    refetch: () => {
      void content.refetch();
      void session.refetch();
    },
    sessionId: session.data?.row.id ?? null,
    startedAt: startedAt ?? null,
    title: content.data?.title ?? '',
    externalId: content.data?.externalId ?? null,
    sections,
    section,
    sectionIndex,
    questions,
    allQuestions,
    currentQuestion,
    currentIndex,
    canPrevious: currentIndex > 0 || sectionIndex > 0,
    canNext: currentIndex < questions.length - 1 || sectionIndex < sections.length - 1,
    secondsRemaining,
    expired: secondsRemaining === 0,
    goToQuestion,
    next,
    previous,
    goToSection,
  };
}
