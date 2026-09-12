import { useAnswerStore } from '../answerStore.ts';

/**
 * Tells the student whether their work has reached the server. This is the
 * visible half of the localStorage-as-safety-net contract: when the network is
 * down we say so, and we say the work is not lost, because it genuinely is not.
 */
export function SaveStatus() {
  const status = useAnswerStore((state) => state.status);
  const pending = useAnswerStore((state) => state.dirty.length);

  if (status === 'error') {
    return (
      <span className="text-xs sm:text-[13px] text-warn font-medium">
        {`Offline — ${pending} answer${pending === 1 ? '' : 's'} saved on this device, retrying`}
      </span>
    );
  }
  if (status === 'flushing') return <span className="text-xs sm:text-[13px] text-ink-muted">Saving…</span>;
  if (status === 'pending') {
    return <span className="text-xs sm:text-[13px] text-warn font-medium">{`${pending} unsaved`}</span>;
  }
  return <span className="text-xs sm:text-[13px] text-success font-medium">All answers saved</span>;
}
