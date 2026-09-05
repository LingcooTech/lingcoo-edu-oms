import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobQuery } from '@lingcoo-edu-oms/contracts';

import { jobsApi } from './api';

export const jobsQueryKeys = {
  all: ['jobs'] as const,
  list: (query: Partial<JobQuery>) => ['jobs', 'list', query] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
};

export function useJobs(query: Partial<JobQuery>) {
  return useQuery({ queryKey: jobsQueryKeys.list(query), queryFn: () => jobsApi.list(query) });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: jobsQueryKeys.detail(id ?? 'none'),
    queryFn: () => jobsApi.get(id!),
    enabled: Boolean(id),
  });
}

function useJobAction(action: 'retry' | 'cancel') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jobsApi[action](id),
    onSettled: (_data, _error, id) =>
      Promise.all([
        client.invalidateQueries({ queryKey: jobsQueryKeys.all }),
        client.invalidateQueries({ queryKey: jobsQueryKeys.detail(id) }),
      ]),
  });
}

export function useRetryJob() {
  return useJobAction('retry');
}

export function useCancelJob() {
  return useJobAction('cancel');
}
