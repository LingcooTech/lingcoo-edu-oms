import { describe, expect, it } from 'vitest';

import {
  cancelLessonOrderRefundRequestSchema,
  confirmOfflineLessonOrderRefundRequestSchema,
  createLessonOrderRefundRequestSchema,
  lessonOrderRefundSchema,
  reviewLessonOrderRefundRequestSchema,
} from '../src/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-09-14T10:00:00+08:00';

describe('lesson commerce refund contracts', () => {
  it('requires versioned, idempotent full-refund requests', () => {
    expect(
      createLessonOrderRefundRequestSchema.parse({
        expectedOrderRevision: 2,
        requestKey: 'refund-request-001',
        reason: '家长取消课程',
      }),
    ).toMatchObject({ expectedOrderRevision: 2 });
    expect(
      createLessonOrderRefundRequestSchema.safeParse({
        expectedOrderRevision: 2,
        requestKey: 'short',
        reason: '退',
      }).success,
    ).toBe(false);
  });

  it('separates approval, cancellation and offline refund confirmation', () => {
    expect(reviewLessonOrderRefundRequestSchema.parse({ expectedRevision: 1 })).toEqual({
      expectedRevision: 1,
      note: null,
    });
    expect(
      cancelLessonOrderRefundRequestSchema.safeParse({ expectedRevision: 1, reason: '取消' })
        .success,
    ).toBe(true);
    expect(
      confirmOfflineLessonOrderRefundRequestSchema.parse({
        expectedRevision: 3,
        paymentMethod: 'wechat_transfer',
        note: '已退回家长微信',
      }),
    ).toMatchObject({ paymentMethod: 'wechat_transfer' });
  });

  it('exposes independent entitlement and funds completion facts', () => {
    expect(
      lessonOrderRefundSchema.parse({
        id,
        requestNo: 'RF202609141000001234',
        requestKey: 'refund-request-001',
        orderId: id,
        orderNo: 'LE202609141000001234',
        institutionId: id,
        studentId: id,
        studentName: '小满',
        guardianId: id,
        guardianName: '小满妈妈',
        productType: 'lesson_package',
        channel: 'offline',
        amountMinor: 5000,
        currency: 'CNY',
        reason: '家长取消课程',
        status: 'awaiting_offline_refund',
        requestedByUserId: id,
        reviewedByUserId: id,
        reviewNote: null,
        offlineRefundMethod: null,
        offlineRefundReference: null,
        offlineRefundNote: null,
        paymentRefundId: null,
        failureStage: null,
        failureCode: null,
        failureMessage: null,
        requestedAt: now,
        approvedAt: now,
        rejectedAt: null,
        cancelledAt: null,
        entitlementRecoveredAt: now,
        fundsRefundedAt: null,
        completedAt: null,
        revision: 4,
        createdAt: now,
        updatedAt: now,
      }).status,
    ).toBe('awaiting_offline_refund');
  });
});
