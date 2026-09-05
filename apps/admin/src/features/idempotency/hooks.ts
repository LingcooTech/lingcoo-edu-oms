import { useQuery } from '@tanstack/react-query';
import type { IdempotencyQuery } from '@lingcoo-edu-oms/contracts';

import { idempotencyApi } from './api';

export const idempotencyQueryKeys = {
  records: (query: Partial<IdempotencyQuery>) => ['idempotency', 'records', query] as const,
  record: (id: string) => ['idempotency', 'records', id] as const,
};

export function useIdempotencyRecords(query: Partial<IdempotencyQuery>) {
  return useQuery({
    queryKey: idempotencyQueryKeys.records(query),
    queryFn: () => idempotencyApi.list(query),
  });
}

export function useIdempotencyRecord(id: string | null) {
  return useQuery({
    queryKey: idempotencyQueryKeys.record(id ?? 'none'),
    queryFn: () => idempotencyApi.get(id!),
    enabled: Boolean(id),
  });
}
