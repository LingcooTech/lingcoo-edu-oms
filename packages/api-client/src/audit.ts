import {
  auditEventPageSchema,
  auditEventSchema,
  auditQuerySchema,
  type AuditQuery,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: AuditQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createAuditApi(client: ApiClient) {
  return {
    list(input: Partial<AuditQuery> = {}) {
      const query = auditQuerySchema.parse(input);
      return client.request({
        path: `/api/audit/events?${queryString(query)}`,
        schema: auditEventPageSchema,
      });
    },
    get(id: string) {
      return client.request({
        path: `/api/audit/events/${encodeURIComponent(id)}`,
        schema: auditEventSchema,
      });
    },
  };
}

export type AuditApi = ReturnType<typeof createAuditApi>;
