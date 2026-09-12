import { useQuery } from '@tanstack/react-query';
import { fetchDashboard, fetchNextAction } from '../services/dashboardService.ts';

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, staleTime: 30_000 });
}

/**
 * The one line of advice, if one has already been written.
 *
 * Never blocks the dashboard and never generates anything. An error here is not
 * worth a banner: the student still has their bands and their recent tests, and
 * a missing recommendation is a missing recommendation, not a broken page.
 */
export function useNextAction() {
  return useQuery({
    queryKey: ['dashboard-next-action'],
    queryFn: fetchNextAction,
    staleTime: 60_000,
    retry: false,
  });
}
