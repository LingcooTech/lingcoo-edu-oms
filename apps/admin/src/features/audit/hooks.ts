import { useQuery } from '@tanstack/react-query';
import type { AuditQuery } from '@lingcoo-edu-oms/contracts';

import { auditApi } from './api';

export const auditQueryKeys = {
  events: (query: Partial<AuditQuery>) => ['audit', 'events', query] as const,
  event: (id: string) => ['audit', 'events', id] as const,
};

export function useAuditEvents(query: Partial<AuditQuery>) {
  return useQuery({ queryKey: auditQueryKeys.events(query), queryFn: () => auditApi.list(query) });
}

export function useAuditEvent(id: string | null) {
  return useQuery({
    queryKey: auditQueryKeys.event(id ?? 'none'),
    queryFn: () => auditApi.get(id!),
    enabled: Boolean(id),
  });
}
