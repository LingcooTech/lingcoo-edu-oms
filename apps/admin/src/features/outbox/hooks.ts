import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OutboxQuery } from '@lingcoo-edu-oms/contracts';

import { outboxApi } from './api';

export const outboxQueryKeys = {
  all: ['outbox'] as const,
  list: (query: Partial<OutboxQuery>) => ['outbox', 'list', query] as const,
  detail: (id: string) => ['outbox', 'detail', id] as const,
};

export function useOutboxEvents(query: Partial<OutboxQuery>) {
  return useQuery({ queryKey: outboxQueryKeys.list(query), queryFn: () => outboxApi.list(query) });
}

export function useOutboxEvent(id: string | null) {
  return useQuery({
    queryKey: outboxQueryKeys.detail(id ?? 'none'),
    queryFn: () => outboxApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useReplayOutboxEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => outboxApi.replay(id),
    onSettled: (_data, _error, id) =>
      Promise.all([
        client.invalidateQueries({ queryKey: outboxQueryKeys.all }),
        client.invalidateQueries({ queryKey: outboxQueryKeys.detail(id) }),
      ]),
  });
}
