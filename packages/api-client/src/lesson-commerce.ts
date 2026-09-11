import {
  idSchema,
  lessonOrderListQuerySchema,
  lessonOrderPageSchema,
  lessonOrderSchema,
  retryLessonOrderGrantRequestSchema,
  type LessonOrderListQuery,
  type RetryLessonOrderGrantRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function pathId(value: string) {
  return encodeURIComponent(idSchema.parse(value));
}

function collectionPath(institutionId: string) {
  return `/api/institutions/${pathId(institutionId)}/orders`;
}

function queryString(input: LessonOrderListQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : '';
}

export function createLessonCommerceApi(client: ApiClient) {
  return {
    list(institutionId: string, input: Partial<LessonOrderListQuery> = {}) {
      const query = lessonOrderListQuerySchema.parse(input);
      return client.request({
        path: `${collectionPath(institutionId)}${queryString(query)}`,
        schema: lessonOrderPageSchema,
      });
    },
    retryGrant(institutionId: string, orderId: string, input: RetryLessonOrderGrantRequest = {}) {
      return client.request({
        method: 'POST',
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/actions/retry-grant`,
        body: retryLessonOrderGrantRequestSchema.parse(input),
        schema: lessonOrderSchema,
      });
    },
  };
}

export type LessonCommerceApi = ReturnType<typeof createLessonCommerceApi>;
