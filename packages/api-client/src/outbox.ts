import {
  outboxEventDetailSchema,
  outboxEventPageSchema,
  outboxQuerySchema,
  type OutboxQuery,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: OutboxQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createOutboxApi(client: ApiClient) {
  return {
    list(input: Partial<OutboxQuery> = {}) {
      const query = outboxQuerySchema.parse(input);
      return client.request({
        path: `/api/outbox/events?${queryString(query)}`,
        schema: outboxEventPageSchema,
      });
    },
    get(id: string) {
      return client.request({
        path: `/api/outbox/events/${encodeURIComponent(id)}`,
        schema: outboxEventDetailSchema,
      });
    },
    replay(id: string) {
      return client.request({
        path: `/api/outbox/events/${encodeURIComponent(id)}/actions/replay`,
        method: 'POST',
        schema: outboxEventDetailSchema,
      });
    },
  };
}

export type OutboxApi = ReturnType<typeof createOutboxApi>;
