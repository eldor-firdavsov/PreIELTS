import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flattenQuestions, type SectionDefinition } from '../types.ts';

describe('IELTS bottom section navigation helpers', () => {
  const mockSections: SectionDefinition[] = [
    {
      id: 'sec-1',
      kind: 'reading',
      order: 1,
      durationSeconds: 1800,
      stimulus: { type: 'passage', title: 'Passage 1', paragraphs: [] },
      groups: [
        {
          id: 'g1',
          order: 1,
          instructions: 'Questions 1-5',
          questions: [
            { id: 'q1', groupId: 'g1', order: 1, prompt: 'Q1', type: 'multiple_choice' },
            { id: 'q2', groupId: 'g1', order: 2, prompt: 'Q2', type: 'multiple_choice' },
            { id: 'q3', groupId: 'g1', order: 3, prompt: 'Q3', type: 'multiple_choice' },
            { id: 'q4', groupId: 'g1', order: 4, prompt: 'Q4', type: 'multiple_choice' },
            { id: 'q5', groupId: 'g1', order: 5, prompt: 'Q5', type: 'multiple_choice' },
          ],
        },
        {
          id: 'g2',
          order: 2,
          instructions: 'Questions 6-10',
          questions: [
            { id: 'q6', groupId: 'g2', order: 6, prompt: 'Q6', type: 'multiple_choice' },
            { id: 'q7', groupId: 'g2', order: 7, prompt: 'Q7', type: 'multiple_choice' },
            { id: 'q8', groupId: 'g2', order: 8, prompt: 'Q8', type: 'multiple_choice' },
            { id: 'q9', groupId: 'g2', order: 9, prompt: 'Q9', type: 'multiple_choice' },
            { id: 'q10', groupId: 'g2', order: 10, prompt: 'Q10', type: 'multiple_choice' },
          ],
        },
      ],
    },
    {
      id: 'sec-2',
      kind: 'reading',
      order: 2,
      durationSeconds: 1800,
      stimulus: { type: 'passage', title: 'Passage 2', paragraphs: [] },
      groups: [
        {
          id: 'g3',
          order: 1,
          instructions: 'Questions 11-20',
          questions: Array.from({ length: 10 }, (_, i) => ({
            id: `q${i + 11}`,
            groupId: 'g3',
            order: i + 11,
            prompt: `Q${i + 11}`,
            type: 'multiple_choice' as const,
          })),
        },
      ],
    },
  ];

  it('correctly flattens and counts questions per section', () => {
    const sec1Questions = flattenQuestions(mockSections[0]!);
    assert.equal(sec1Questions.length, 10);
    assert.equal(sec1Questions[0]!.order, 1);
    assert.equal(sec1Questions[9]!.order, 10);

    const sec2Questions = flattenQuestions(mockSections[1]!);
    assert.equal(sec2Questions.length, 10);
    assert.equal(sec2Questions[0]!.order, 11);
    assert.equal(sec2Questions[9]!.order, 20);
  });

  it('formats section label correctly for Part N', () => {
    const partLabel = (order: number) => `Part ${order}`;
    assert.equal(partLabel(mockSections[0]!.order), 'Part 1');
    assert.equal(partLabel(mockSections[1]!.order), 'Part 2');
  });
});
