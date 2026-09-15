import { describe, expect, it } from 'vitest';

import {
  groupMatchingEnrollmentSchema,
  recordGroupMatchingDepositRefundRequestSchema,
  withdrawGroupMatchingEnrollmentRequestSchema,
} from '../src/index.js';

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-09-14T10:00:00+08:00';

describe('group matching exit contracts', () => {
  it('requires a full positive deposit refund and a traceable withdrawal reason', () => {
    expect(
      recordGroupMatchingDepositRefundRequestSchema.parse({
        expectedRevision: 2,
        refundedAmountMinor: 1000,
        refundMethod: 'wechat_transfer',
        refundNote: '已线下退回',
      }),
    ).toMatchObject({ refundedAmountMinor: 1000 });
    expect(
      recordGroupMatchingDepositRefundRequestSchema.safeParse({
        expectedRevision: 2,
        refundedAmountMinor: 0,
        refundMethod: 'cash',
      }).success,
    ).toBe(false);
    expect(
      withdrawGroupMatchingEnrollmentRequestSchema.safeParse({
        expectedRevision: 3,
        reason: '',
      }).success,
    ).toBe(false);
  });

  it('retains both immutable refund facts and withdrawal facts', () => {
    const parsed = groupMatchingEnrollmentSchema.parse({
      id,
      campaignId: id,
      institutionId: id,
      studentId: id,
      studentNameSnapshot: '小满',
      guardianId: id,
      guardianNameSnapshot: '小满妈妈',
      status: 'withdrawn',
      schedulePreference: null,
      notes: null,
      source: 'admin',
      depositAmountMinor: 1000,
      depositPaymentMethod: 'wechat_transfer',
      depositPaymentReference: 'PAY-001',
      depositPaymentNote: null,
      depositPaidAt: now,
      depositRecordedByUserId: id,
      depositRefund: {
        id,
        amountMinor: 1000,
        currency: 'CNY',
        refundMethod: 'wechat_transfer',
        refundReference: 'REF-001',
        refundNote: '已退款',
        refundedAt: now,
        recordedByUserId: id,
        idempotencyKey: 'refund-key-001',
        enrollmentRevisionBefore: 2,
        createdAt: now,
      },
      withdrawnAt: now,
      withdrawalReason: '家长时间冲突',
      withdrawnByUserId: id,
      revision: 4,
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.depositRefund?.amountMinor).toBe(1000);
    expect(parsed.withdrawalReason).toBe('家长时间冲突');
  });
});
