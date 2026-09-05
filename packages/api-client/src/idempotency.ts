import {
  idempotencyQuerySchema,
  idempotencyRecordPageSchema,
  idempotencyRecordSchema,
  type IdempotencyQuery,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: IdempotencyQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createIdempotencyApi(client: ApiClient) {
  return {
    list(input: Partial<IdempotencyQuery> = {}) {
      const query = idempotencyQuerySchema.parse(input);
      return client.request({
        path: `/api/idempotency/records?${queryString(query)}`,
        schema: idempotencyRecordPageSchema,
      });
    },
    get(id: string) {
      return client.request({
        path: `/api/idempotency/records/${encodeURIComponent(id)}`,
        schema: idempotencyRecordSchema,
      });
    },
  };
}

export type IdempotencyApi = ReturnType<typeof createIdempotencyApi>;
