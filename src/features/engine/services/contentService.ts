import { supabase } from '../../../lib/supabase/client.ts';
import type { Json } from '../../../lib/supabase/types.generated.ts';
import type { Option, Paragraph, Question, QuestionGroup, QuestionType, SectionDefinition, SectionKind, Stimulus, TestDefinition } from '../types.ts';
import { formatTestTitle } from '../utils/testTitle.ts';

/**
 * Loads test content for the engine.
 *
 * Questions come from `questions_public`, the view that omits correct_answer,
 * accepted_variants and evidence. There is no code path here that reads the
 * `questions` table, and RLS would refuse it anyway.
 */

function asOptions(raw: Json | null): Option[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const options = raw
    .filter((item): item is { [k: string]: Json | undefined } => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({ label: String(item.label ?? ''), text: String(item.text ?? '') }))
    .filter((option) => option.label !== '');
  return options.length > 0 ? options : undefined;
}

function asStimulus(raw: Json, kind?: string, externalId?: string): Stimulus {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    if (kind === 'listening') {
      return { type: 'audio', audioPath: externalId ? `audio/${externalId}.mp3` : null };
    }
    return { type: 'none' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.type === 'passage' || Array.isArray(obj.paragraphs)) {
    const paragraphs: Paragraph[] = Array.isArray(obj.paragraphs)
      ? obj.paragraphs
          .filter((p): p is { [k: string]: Json | undefined } => typeof p === 'object' && p !== null && !Array.isArray(p))
          .map((p) => ({
            label: typeof p.label === 'string' ? p.label : null,
            text: String(p.text ?? ''),
          }))
      : [];
    return { type: 'passage', title: String(obj.title ?? ''), paragraphs };
  }
  const audioUrl = obj.audio_url ?? obj.audioUrl ?? obj.url ?? obj.path ?? obj.audio_path;
  if (obj.type === 'audio' || typeof audioUrl === 'string' || kind === 'listening') {
    const path = typeof audioUrl === 'string' && audioUrl.trim() !== ''
      ? audioUrl.trim()
      : externalId ? `audio/${externalId}.mp3` : null;
    return { type: 'audio', audioPath: path };
  }
  return { type: 'none' };
}

export async function loadTestDefinition(testId: string): Promise<TestDefinition> {
  const { data: test, error: testError } = await supabase
    .from('tests')
    .select('id, external_id, title, is_full_mock')
    .eq('id', testId)
    .single();
  if (testError) throw new Error(testError.message);

  const { data: sections, error: sectionError } = await supabase
    .from('sections')
    .select('id, kind, ordinal, duration_seconds, stimulus')
    .eq('test_id', testId)
    .order('ordinal');
  if (sectionError) throw new Error(sectionError.message);

  const sectionIds = sections.map((s) => s.id);
  const { data: groups, error: groupError } = await supabase
    .from('question_groups')
    .select('id, section_id, ordinal, instructions, shared_options')
    .in('section_id', sectionIds)
    .order('ordinal');
  if (groupError) throw new Error(groupError.message);

  const groupIds = groups.map((g) => g.id);
  const { data: questions, error: questionError } = await supabase
    .from('questions_public')
    .select('id, group_id, ordinal, type, prompt, options')
    .in('group_id', groupIds)
    .order('ordinal');
  if (questionError) throw new Error(questionError.message);

  const questionsByGroup = new Map<string, Question[]>();
  for (const row of questions) {
    if (!row.id || !row.group_id || row.ordinal === null || !row.type) continue;
    const list = questionsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      groupId: row.group_id,
      order: row.ordinal,
      type: row.type as QuestionType,
      prompt: row.prompt ?? '',
      options: asOptions(row.options),
    });
    questionsByGroup.set(row.group_id, list);
  }

  const groupsBySection = new Map<string, QuestionGroup[]>();
  for (const row of groups) {
    const list = groupsBySection.get(row.section_id) ?? [];
    list.push({
      id: row.id,
      order: row.ordinal,
      instructions: row.instructions ?? '',
      sharedOptions: asOptions(row.shared_options),
      questions: (questionsByGroup.get(row.id) ?? []).sort((a, b) => a.order - b.order),
    });
    groupsBySection.set(row.section_id, list);
  }

  const definition: SectionDefinition[] = sections.map((row) => ({
    id: row.id,
    kind: row.kind as SectionKind,
    order: row.ordinal,
    durationSeconds: row.duration_seconds,
    stimulus: asStimulus(row.stimulus, row.kind, test.external_id),
    groups: (groupsBySection.get(row.id) ?? []).sort((a, b) => a.order - b.order),
  }));

  return {
    id: test.id,
    externalId: test.external_id,
    title: formatTestTitle(test.title, test.external_id, definition[0]?.kind),
    isFullMock: test.is_full_mock,
    sections: definition,
  };
}

export interface TestSummary {
  id: string;
  external_id: string;
  title: string;
  is_full_mock: boolean;
  created_at: string;
  /** The skills this paper actually contains, in a stable order. */
  kinds: SectionKind[];
  /** How many sections, and how long the whole paper runs. */
  sectionCount: number;
  durationSeconds: number;
}

const KIND_ORDER: SectionKind[] = ['listening', 'reading'];

/**
 * Readable tests, newest first.
 *
 * The section kinds come along because the tests page has to know where a test
 * leads: a listening paper opened on the reading route renders a passage pane
 * over audio content. Deriving that from the sections is the only honest
 * source, since `tests` itself records no skill.
 */
export async function listTests(): Promise<TestSummary[]> {
  const { data, error } = await supabase
    .from('tests')
    .select('id, external_id, title, is_full_mock, created_at, sections(kind, duration_seconds)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const sections = row.sections ?? [];
    const present = new Set(sections.map((section) => section.kind as SectionKind));
    return {
      id: row.id,
      external_id: row.external_id,
      title: formatTestTitle(row.title, row.external_id, KIND_ORDER.find((kind) => present.has(kind))),
      is_full_mock: row.is_full_mock,
      created_at: row.created_at,
      kinds: KIND_ORDER.filter((kind) => present.has(kind)),
      sectionCount: sections.length,
      // "Do I have an hour right now?" is the question a student is actually
      // asking when they look at this list, and it was not answered anywhere.
      durationSeconds: sections.reduce((total, section) => total + (section.duration_seconds ?? 0), 0),
    };
  });
}

/** Where a test opens. A full mock starts on its first section's skill. */
export function testRoute(test: TestSummary): string | null {
  const [first] = test.kinds;
  if (first === 'reading' || first === 'listening') {
    return `/tests/${test.id}/${first}`;
  }
  return null;
}
