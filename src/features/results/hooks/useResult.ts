import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { signAudioUrl } from '../../engine/index.ts';
import {
  fetchCachedAnalysis, fetchResult, fetchSectionStimulus, requestAnalysis,
  type AnalysisResult, type MistakeKind,
} from '../services/resultsService.ts';

export function useResult(resultId: string) {
  return useQuery({
    queryKey: ['result', resultId],
    queryFn: () => fetchResult(resultId),
    staleTime: Infinity, // A submitted result never changes.
  });
}

/** The passage or recording a mistake came from, loaded only when asked for. */
export function useSectionStimulus(sectionId: string | null) {
  return useQuery({
    queryKey: ['section-stimulus', sectionId],
    queryFn: () => fetchSectionStimulus(sectionId as string),
    enabled: sectionId !== null,
    staleTime: Infinity,
  });
}

/**
 * A signed URL for replaying a moment from a recording.
 *
 * Replay is allowed here and refused during the test. That is not an
 * inconsistency: hearing a clip once is what makes the band mean something, and
 * hearing it again afterwards is the entire point of reviewing a mistake.
 */
export function useAudioUrl(audioPath: string | null) {
  return useQuery({
    queryKey: ['listening-audio', audioPath],
    queryFn: () => signAudioUrl(audioPath as string),
    enabled: audioPath !== null,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * "Why was I wrong?" for one mistake.
 *
 * The cached row is a query, the generation is a mutation, and the mutation
 * writes its answer into the query's cache. That keeps a second click on the
 * same question free, and it keeps the button honest about which one happened.
 *
 * The kind is part of the cache key as well as of the request, because reading
 * and listening explanations are different shapes stored under different
 * scopes. Two questions can never share a mistake id, so this is belt and
 * braces — but it is the kind of belt that stops a schema change from quietly
 * handing a listening card a reading explanation.
 */
export function useMistakeAnalysis(mistakeId: string, kind: MistakeKind, enabled: boolean) {
  const queryClient = useQueryClient();
  const key = ['mistake-analysis', kind, mistakeId];

  const cached = useQuery({
    queryKey: key,
    queryFn: () => fetchCachedAnalysis(mistakeId, kind),
    enabled,
    staleTime: Infinity,
  });

  const generate = useMutation({
    mutationFn: () => requestAnalysis(mistakeId, kind),
    onSuccess: (result: AnalysisResult) => queryClient.setQueryData(key, result),
  });

  return { cached, generate };
}
