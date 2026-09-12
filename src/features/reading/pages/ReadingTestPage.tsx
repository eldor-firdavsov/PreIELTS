import { useParams } from 'react-router-dom';
import { ExamGate, ExamSurface, useTestSession } from '../../engine/index.ts';
import { readingRenderers } from '../renderers/index.ts';
import { PassagePane } from '../components/PassagePane.tsx';

/**
 * The reading exam — docs/ARCHITECTURE.md §7.
 *
 * Everything structural lives in the engine's ExamSurface, which reading and
 * listening share. What is reading's own is exactly two things: the passage in
 * the left pane, and which renderer answers for which question type.
 */
export default function ReadingTestPage() {
  const { testId = '' } = useParams();
  const session = useTestSession(testId);

  if (session.loading || session.error) return <ExamGate session={session} />;

  return (
    <ExamSurface
      session={session}
      registry={readingRenderers}
      partLabel={(order) => `Part ${order}`}
      paneLabels={{ stimulus: 'Passage', main: 'Questions' }}
      stimulus={<PassagePane stimulus={session.section?.stimulus} />}
    />
  );
}
