import {
  idSchema,
  createOfflineLessonOrderRequestSchema,
  lessonOrderListQuerySchema,
  lessonOrderPageSchema,
  lessonOrderSchema,
  lessonReceiptSchema,
  retryLessonOrderGrantRequestSchema,
  refundLessonOrderRequestSchema,
  createLessonOrderRefundRequestSchema,
  reviewLessonOrderRefundRequestSchema,
  cancelLessonOrderRefundRequestSchema,
  confirmOfflineLessonOrderRefundRequestSchema,
  lessonOrderRefundListSchema,
  lessonOrderRefundSchema,
  recordGroupOrderOfflineSettlementRequestSchema,
  type LessonOrderListQuery,
  type CreateOfflineLessonOrderRequest,
  type RecordGroupOrderOfflineSettlementRequest,
  type RetryLessonOrderGrantRequest,
  type RefundLessonOrderRequest,
  type CreateLessonOrderRefundRequest,
  type ReviewLessonOrderRefundRequest,
  type CancelLessonOrderRefundRequest,
  type ConfirmOfflineLessonOrderRefundRequest,
  startGroupOrderOnlinePaymentRequestSchema,
  type StartGroupOrderOnlinePaymentRequest,
  lessonOrderCheckoutSchema,
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
    refund(institutionId: string, orderId: string, input: RefundLessonOrderRequest) {
      return client.request({
        method: 'POST',
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/actions/refund`,
        body: refundLessonOrderRequestSchema.parse(input),
        schema: lessonOrderSchema,
      });
    },
    listRefunds(institutionId: string, orderId: string) {
      return client.request({
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/refunds`,
        schema: lessonOrderRefundListSchema,
      });
    },
    requestRefund(institutionId: string, orderId: string, input: CreateLessonOrderRefundRequest) {
      return client.request({
        method: 'POST',
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/refunds`,
        body: createLessonOrderRefundRequestSchema.parse(input),
        schema: lessonOrderRefundSchema,
      });
    },
    approveRefund(institutionId: string, refundId: string, input: ReviewLessonOrderRefundRequest) {
      return client.request({
        method: 'POST',
        path: `/api/institutions/${pathId(institutionId)}/refunds/${pathId(refundId)}/actions/approve`,
        body: reviewLessonOrderRefundRequestSchema.parse(input),
        schema: lessonOrderRefundSchema,
      });
    },
    rejectRefund(institutionId: string, refundId: string, input: ReviewLessonOrderRefundRequest) {
      return client.request({
        method: 'POST',
        path: `/api/institutions/${pathId(institutionId)}/refunds/${pathId(refundId)}/actions/reject`,
        body: reviewLessonOrderRefundRequestSchema.parse(input),
        schema: lessonOrderRefundSchema,
      });
    },
    cancelRefund(institutionId: string, refundId: string, input: CancelLessonOrderRefundRequest) {
      return client.request({
        method: 'POST',
        path: `/api/institutions/${pathId(institutionId)}/refunds/${pathId(refundId)}/actions/cancel`,
        body: cancelLessonOrderRefundRequestSchema.parse(input),
        schema: lessonOrderRefundSchema,
      });
    },
    confirmOfflineRefund(
      institutionId: string,
      refundId: string,
      input: ConfirmOfflineLessonOrderRefundRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `/api/institutions/${pathId(institutionId)}/refunds/${pathId(refundId)}/actions/confirm-offline`,
        body: confirmOfflineLessonOrderRefundRequestSchema.parse(input),
        schema: lessonOrderRefundSchema,
      });
    },
    startGroupOnlinePayment(
      institutionId: string,
      orderId: string,
      input: StartGroupOrderOnlinePaymentRequest = {},
    ) {
      return client.request({
        method: 'POST',
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/actions/start-online-payment`,
        body: startGroupOrderOnlinePaymentRequestSchema.parse(input),
        schema: lessonOrderCheckoutSchema,
      });
    },
    recordGroupOfflineSettlement(
      institutionId: string,
      orderId: string,
      input: RecordGroupOrderOfflineSettlementRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${collectionPath(institutionId)}/${pathId(orderId)}/actions/record-offline-settlement`,
        body: recordGroupOrderOfflineSettlementRequestSchema.parse(input),
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
