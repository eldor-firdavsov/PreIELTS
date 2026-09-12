import type { Stimulus } from '../../engine/index.ts';
import { EmptyState } from '../../../design-system/index.ts';

/** The left-hand reading passage. Scrolls independently of the questions. */
export function PassagePane({ stimulus }: { stimulus: Stimulus | undefined }) {
  if (!stimulus || stimulus.type !== 'passage') {
    return <EmptyState title="No passage" description="This section has no reading passage." />;
  }

  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6 lg:px-8">
      <h2 className="mb-4 font-serif text-lg sm:text-[20px] font-semibold text-ink leading-snug">{stimulus.title}</h2>
      <div className="measure flex flex-col gap-4">
        {stimulus.paragraphs.map((paragraph, index) => (
          <p key={index} className="reading-prose font-serif text-base sm:text-[17px] leading-[1.8] text-ink">
            {paragraph.label && (
              <strong className="mr-2 font-bold text-ink-muted">{paragraph.label}</strong>
            )}
            {paragraph.text}
          </p>
        ))}
      </div>
    </article>
  );
}
