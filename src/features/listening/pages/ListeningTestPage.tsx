import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ExamGate, ExamSurface, useTestSession } from '../../engine/index.ts';
import { listeningRenderers } from '../renderers/index.ts';
import { ListeningPlayer } from '../components/ListeningPlayer.tsx';

/**
 * The listening exam — docs/ARCHITECTURE.md §7, docs/SPEC.md §10.
 *
 * The same engine, the same store and the same deterministic scoring as
 * reading. Listening's own contribution is the player in the left pane and its
 * renderer registry.
 *
 * The recording is one file for the whole paper: every section's stimulus
 * carries the same path, and the markers into it are absolute. So the player is
 * mounted once here, above the section switch, and moving between parts does
 * not restart it — which is also what the exam does, since the tape does not
 * care which page you are looking at.
 */
export default function ListeningTestPage() {
  const { testId = '' } = useParams();
  const session = useTestSession(testId);

  // The current section's recording, falling back to the paper's, so a section
  // whose stimulus is missing a path still plays the test's audio.
  const audioPath = useMemo(() => {
    const fromSections = session.sections
      .map((section) => (section.stimulus.type === 'audio' ? section.stimulus.audioPath : null))
      .filter((path): path is string => typeof path === 'string' && path !== '');
    const current = session.section?.stimulus;
    if (current?.type === 'audio' && current.audioPath) return current.audioPath;
    return fromSections[0] ?? null;
  }, [session.sections, session.section]);

  if (session.loading || session.error) return <ExamGate session={session} />;

  return (
    <ExamSurface
      session={session}
      registry={listeningRenderers}
      partLabel={(order) => `Section ${order}`}
      paneLabels={{ stimulus: 'Recording', main: 'Questions' }}
      stimulus={
        <ListeningPlayer
          audioPath={audioPath}
          startedAt={session.startedAt}
          expired={session.expired}
        />
      }
    />
  );
}
