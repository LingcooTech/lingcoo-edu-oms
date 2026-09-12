import {
  idSchema,
  createOfflineLessonOrderRequestSchema,
  lessonOrderListQuerySchema,
  lessonOrderPageSchema,
  lessonOrderSchema,
  lessonReceiptSchema,
  retryLessonOrderGrantRequestSchema,
  type LessonOrderListQuery,
  type CreateOfflineLessonOrderRequest,
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
  const queryKeys: Array<keyof LessonOrderListQuery> = [
    'page',
    'pageSize',
    'search',
    'productType',
    'status',
    'studentId',
  ];
  for (const key of queryKeys) {
    const value = input[key];
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
    createOffline(
      institutionId: string,
      input: CreateOfflineLessonOrderRequest,
      idempotencyKey: string,
    ) {
      return client.request({
        method: 'POST',
        path: `${collectionPath(institutionId)}/offline`,
        headers: { 'idempotency-key': idempotencyKey },
        body: createOfflineLessonOrderRequestSchema.parse(input),
        schema: lessonOrderSchema,
      });
    },
    receipt(institutionId: string, orderId: string) {
      return client.request({
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/receipt`,
        schema: lessonReceiptSchema,
      });
    },
  };
}

export type LessonCommerceApi = ReturnType<typeof createLessonCommerceApi>;
