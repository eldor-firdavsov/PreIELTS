import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { completeOnboarding, fetchMyProfile, type OnboardingAnswers, type Profile } from '../services/profileService.ts';

export const PROFILE_QUERY_KEY = ['my-profile'];

export function useProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchMyProfile,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: OnboardingAnswers) => completeOnboarding(answers),
    onSuccess: (profile: Profile) => queryClient.setQueryData(PROFILE_QUERY_KEY, profile),
  });
}
