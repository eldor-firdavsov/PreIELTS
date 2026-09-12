import { createContext, useContext } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useAnswerStore } from './answerStore.ts';
import { EmptyState } from '../../design-system/index.ts';
import type { AnswerValue, Question, QuestionGroup, QuestionType } from './types.ts';

/**
 * One switch on question.type — docs/ARCHITECTURE.md §3.
 *
 * The switch is a registry rather than a literal `switch` statement because
 * the engine may not import a feature. Reading supplies its renderers, and
 * listening will supply its own; the engine only knows the contract. Adding a
 * question type is still one renderer plus one entry.
 */

export interface QuestionRendererProps {
  question: Question;
  group: QuestionGroup;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}

export type RendererRegistry = Partial<Record<QuestionType, ComponentType<QuestionRendererProps>>>;

const RegistryContext = createContext<RendererRegistry | null>(null);

export function RendererProvider({
  registry,
  children,
}: {
  registry: RendererRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function QuestionRenderer({
  question,
  group,
  disabled = false,
}: {
  question: Question;
  group: QuestionGroup;
  disabled?: boolean;
}) {
  const registry = useContext(RegistryContext);
  const value = useAnswerStore((state) => state.answers[question.id]?.value ?? null);
  const setAnswer = useAnswerStore((state) => state.setAnswer);

  if (!registry) throw new Error('QuestionRenderer must be used inside <RendererProvider>');

  const Renderer = registry[question.type];
  if (!Renderer) {
    // Honest placeholder rather than a silently blank question.
    return (
      <EmptyState
        title="This question type is not supported yet"
        description={`Question ${question.order} is a ${question.type.replace(/_/g, ' ')} question, which this section cannot display.`}
      />
    );
  }

  return (
    <Renderer
      question={question}
      group={group}
      value={value}
      onChange={(next) => setAnswer(question.id, next)}
      disabled={disabled}
    />
  );
}
