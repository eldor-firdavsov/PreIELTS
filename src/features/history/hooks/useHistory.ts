import { useQuery } from '@tanstack/react-query';
import { listResults } from '../services/historyService.ts';

export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: listResults,
    // A submitted result never changes, but a new one can arrive at any time.
    staleTime: 30_000,
  });
}
