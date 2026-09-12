import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAnalysis, fetchStudyPlanState, requestStudyPlan, type StudyPlanState } from '../services/analysisService.ts';

export function useAnalysis() {
  return useQuery({ queryKey: ['analysis'], queryFn: fetchAnalysis, staleTime: 30_000 });
}

/**
 * The study plan: a read that is free, and a generation the student asks for.
 *
 * Same shape as "Why was I wrong?" and for the same reason. The stored plan is
 * a query, writing a new one is a mutation, and the mutation puts its answer
 * into the query's cache so a second visit costs nothing. The page never calls
 * a model on its own: advice is generated when the student wants advice.
 */
export function useStudyPlan() {
  const queryClient = useQueryClient();
  const key = ['study-plan'];

  const stored = useQuery({
    queryKey: key,
    queryFn: fetchStudyPlanState,
    // Cheap, but not free: it costs an RPC. Long enough that switching tabs
    // does not re-ask, short enough that a test sat in another tab shows up.
    staleTime: 60_000,
  });

  const generate = useMutation({
    mutationFn: requestStudyPlan,
    onSuccess: (state: StudyPlanState) => queryClient.setQueryData(key, state),
  });

  return { stored, generate };
}
