import { createApiClient, createGroupMatchingApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

const institutionId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const enrollmentId = '33333333-3333-4333-8333-333333333333';
const now = '2026-09-14T02:00:00.000Z';

function enrollment(status: 'deposit_refunded' | 'withdrawn') {
  return {
    id: enrollmentId,
    campaignId,
    institutionId,
    studentId: '44444444-4444-4444-8444-444444444444',
    studentNameSnapshot: '小满',
    guardianId: '55555555-5555-4555-8555-555555555555',
    guardianNameSnapshot: '小满妈妈',
    status,
    schedulePreference: null,
    notes: null,
    source: 'admin',
    depositAmountMinor: 1000,
    depositPaymentMethod: 'wechat_transfer',
    depositPaymentReference: 'PAY-001',
    depositPaymentNote: null,
    depositPaidAt: now,
    depositRecordedByUserId: '66666666-6666-4666-8666-666666666666',
    depositRefund: {
      id: '77777777-7777-4777-8777-777777777777',
      amountMinor: 1000,
      currency: 'CNY',
      refundMethod: 'wechat_transfer',
      refundReference: 'REF-001',
      refundNote: '已退回',
      refundedAt: now,
      recordedByUserId: '66666666-6666-4666-8666-666666666666',
      idempotencyKey: 'deposit-refund-key',
      enrollmentRevisionBefore: 2,
      createdAt: now,
    },
    withdrawnAt: status === 'withdrawn' ? now : null,
    withdrawalReason: status === 'withdrawn' ? '时间冲突' : null,
    withdrawnByUserId: status === 'withdrawn' ? '66666666-6666-4666-8666-666666666666' : null,
    revision: status === 'withdrawn' ? 4 : 3,
    createdAt: now,
    updatedAt: now,
  };
}

describe('group matching exit API client', () => {
  it('records a deposit refund and then withdraws with separate idempotency keys', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(enrollment('deposit_refunded')))
      .mockResolvedValueOnce(Response.json(enrollment('withdrawn')));
    const api = createGroupMatchingApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-token' }),
    );

    await api.recordDepositRefund(
      institutionId,
      campaignId,
      enrollmentId,
      {
        expectedRevision: 2,
        refundedAmountMinor: 1000,
        refundMethod: 'wechat_transfer',
        refundNote: '已退回',
      },
      'deposit-refund-key',
    );
    await api.withdrawEnrollment(
      institutionId,
      campaignId,
      enrollmentId,
      { expectedRevision: 3, reason: '时间冲突' },
      'withdrawal-key-001',
    );

    expect(fetch.mock.calls[0]?.[0]).toContain('/actions/refund-deposit');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toBe(
      'deposit-refund-key',
    );
    expect(fetch.mock.calls[1]?.[0]).toContain('/actions/withdraw');
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('idempotency-key')).toBe(
      'withdrawal-key-001',
    );
  });
});
