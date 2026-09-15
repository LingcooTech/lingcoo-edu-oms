import { describe, expect, it, vi } from 'vitest';

import type { DatabaseHandle } from '../src/database/database.js';
import { LessonCommerceService } from '../src/modules/lesson-commerce/application/lesson-commerce.service.js';
import type {
  LessonCommerceOrderRecord,
  LessonCommerceRefundRecord,
  LessonCommerceRepository,
} from '../src/modules/lesson-commerce/infrastructure/persistence/lesson-commerce.repository.js';

const institutionId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const refundId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-09-15T02:00:00.000Z');

function order(status: LessonCommerceOrderRecord['status']): LessonCommerceOrderRecord {
  return {
    id: orderId,
    orderNo: 'EDU202609150001',
    institutionId,
    studentId: '55555555-5555-4555-8555-555555555555',
    studentName: '小满',
    guardianId: '66666666-6666-4666-8666-666666666666',
    guardianName: '小满妈妈',
    createdByUserId: actorId,
    sourceType: 'normal',
    sourceReferenceId: null,
    productType: 'lesson_package',
    packageId: '77777777-7777-4777-8777-777777777777',
    packageVersionId: '88888888-8888-4888-8888-888888888888',
    packageVersion: 1,
    packageName: '通用课时包',
    baseUnits: 20,
    bonusUnits: 2,
    periodCardProductId: null,
    periodCardProductVersionId: null,
    periodCardProductVersion: null,
    periodCardProductName: null,
    periodCardMode: null,
    periodCardUsageLimit: null,
    periodCardDurationUnit: null,
    periodCardDurationCount: null,
    periodCardActivationPolicy: null,
    channel: 'offline',
    listedAmountMinor: 200000,
    amountMinor: 200000,
    depositAppliedMinor: 0,
    balanceDueMinor: 200000,
    currency: 'CNY',
    provider: null,
    paymentMethod: 'wechat_transfer',
    paymentReference: 'PAY-001',
    paymentNote: null,
    priceAdjustmentReason: null,
    receiptNo: 'RCPT-001',
    paymentIntentId: null,
    grantMovementId: '99999999-9999-4999-8999-999999999999',
    periodCardEntitlementId: null,
    status,
    failureCode: null,
    failureMessage: null,
    paidAt: now,
    completedAt: status === 'completed' ? now : null,
    closedAt: null,
    expiresAt: null,
    paymentDeadlineAt: null,
    revision: status === 'completed' ? 3 : 4,
    createdAt: now,
    updatedAt: now,
  };
}

function refund(
  status: LessonCommerceRefundRecord['status'],
  overrides: Partial<LessonCommerceRefundRecord> = {},
): LessonCommerceRefundRecord {
  return {
    id: refundId,
    requestNo: 'RF202609150001',
    requestKey: 'refund-key-001',
    orderId,
    orderNo: 'EDU202609150001',
    institutionId,
    studentId: '55555555-5555-4555-8555-555555555555',
    studentName: '小满',
    guardianId: '66666666-6666-4666-8666-666666666666',
    guardianName: '小满妈妈',
    productType: 'lesson_package',
    channel: 'offline',
    amountMinor: 200000,
    currency: 'CNY',
    orderCompletedAt: now,
    reason: '协商退课',
    status,
    requestedByUserId: actorId,
    reviewedByUserId: status === 'requested' ? null : actorId,
    reviewNote: null,
    offlineRefundMethod: null,
    offlineRefundReference: null,
    offlineRefundNote: null,
    paymentRefundId: null,
    failureStage: null,
    failureCode: null,
    failureMessage: null,
    requestedAt: now,
    approvedAt: status === 'requested' ? null : now,
    rejectedAt: null,
    cancelledAt: null,
    entitlementRecoveredAt: null,
    fundsRefundedAt: null,
    completedAt: null,
    revision:
      status === 'requested' ? 1 : status === 'approved' ? 2 : status === 'processing' ? 3 : 4,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function service(repository: Record<string, unknown>, lessons: Record<string, unknown> = {}) {
  const database = {
    db: {},
    transaction: async <T>(work: (transaction: unknown) => Promise<T>) => work({}),
  } as unknown as DatabaseHandle;
  return new LessonCommerceService(
    database,
    repository as unknown as LessonCommerceRepository,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    lessons as never,
    {} as never,
    {} as never,
    {} as never,
    { record: vi.fn().mockResolvedValue(undefined) },
    {} as never,
    () => now,
  );
}

const actor = { actorId, actorType: 'user' as const };

describe('lesson commerce refund workflow', () => {
  it('recovers lesson rights before waiting for and confirming an offline refund', async () => {
    const requested = refund('requested');
    const approved = refund('approved');
    const processing = refund('processing');
    const recovered = refund('processing', { entitlementRecoveredAt: now, revision: 4 });
    const awaiting = refund('awaiting_offline_refund', {
      entitlementRecoveredAt: now,
      revision: 5,
    });
    const funded = refund('awaiting_offline_refund', {
      entitlementRecoveredAt: now,
      fundsRefundedAt: now,
      offlineRefundMethod: 'wechat_transfer',
      offlineRefundReference: 'REF-001',
      revision: 6,
    });
    const completed = refund('completed', {
      entitlementRecoveredAt: now,
      fundsRefundedAt: now,
      completedAt: now,
      offlineRefundMethod: 'wechat_transfer',
      offlineRefundReference: 'REF-001',
      revision: 7,
    });
    const refundingOrder = order('refunding');
    const repository = {
      findRefundRequestById: vi.fn().mockResolvedValue(requested),
      lockRefundRequest: vi
        .fn()
        .mockResolvedValueOnce(requested)
        .mockResolvedValueOnce(approved)
        .mockResolvedValueOnce(processing)
        .mockResolvedValueOnce(recovered)
        .mockResolvedValueOnce(awaiting)
        .mockResolvedValueOnce(funded),
      lockById: vi
        .fn()
        .mockResolvedValueOnce(order('completed'))
        .mockResolvedValueOnce(refundingOrder),
      approveRefundRequest: vi.fn().mockResolvedValue(approved),
      markRefunding: vi.fn().mockResolvedValue(refundingOrder),
      markRefundProcessing: vi.fn().mockResolvedValue(processing),
      findById: vi.fn().mockResolvedValue(refundingOrder),
      markEntitlementRecovered: vi.fn().mockResolvedValue(recovered),
      markAwaitingOfflineRefund: vi.fn().mockResolvedValue(awaiting),
      markFundsRefunded: vi.fn().mockResolvedValue(funded),
      markRefunded: vi.fn().mockResolvedValue(order('refunded')),
      markRefundRequestCompleted: vi.fn().mockResolvedValue(completed),
    };
    const lessons = { refundPurchase: vi.fn().mockResolvedValue(undefined) };
    const subject = service(repository, lessons);

    const approvedResult = await subject.approveRefundRequest(
      institutionId,
      refundId,
      { expectedRevision: 1, note: '审批通过' },
      actor,
    );
    expect(approvedResult.status).toBe('awaiting_offline_refund');
    expect(lessons.refundPurchase).toHaveBeenCalledOnce();
    expect(repository.markAwaitingOfflineRefund).toHaveBeenCalledOnce();

    const completedResult = await subject.confirmOfflineRefund(
      institutionId,
      refundId,
      {
        expectedRevision: 5,
        paymentMethod: 'wechat_transfer',
        paymentReference: 'REF-001',
      },
      actor,
    );
    expect(completedResult.status).toBe('completed');
    expect(repository.markRefunded).toHaveBeenCalledOnce();
    expect(repository.markRefundRequestCompleted).toHaveBeenCalledOnce();
  });

  it('persists the recovery fact and never restores the order when post-recovery recording fails', async () => {
    const requested = refund('requested');
    const approved = refund('approved');
    const processing = refund('processing');
    const recovered = refund('processing', { entitlementRecoveredAt: now, revision: 4 });
    const failed = refund('failed', {
      entitlementRecoveredAt: now,
      failureStage: 'finalization',
      failureCode: 'LESSON_ORDER_REFUND_FAILED',
      failureMessage: '退款处理失败，请核查后重试',
      revision: 5,
    });
    const repository = {
      findRefundRequestById: vi.fn().mockResolvedValue(requested),
      lockRefundRequest: vi
        .fn()
        .mockResolvedValueOnce(requested)
        .mockResolvedValueOnce(approved)
        .mockResolvedValueOnce(processing)
        .mockResolvedValueOnce(processing),
      lockById: vi
        .fn()
        .mockResolvedValueOnce(order('completed'))
        .mockResolvedValueOnce(order('refunding')),
      approveRefundRequest: vi.fn().mockResolvedValue(approved),
      markRefunding: vi.fn().mockResolvedValue(order('refunding')),
      markRefundProcessing: vi.fn().mockResolvedValue(processing),
      findById: vi.fn().mockResolvedValue(order('refunding')),
      markEntitlementRecovered: vi
        .fn()
        .mockRejectedValueOnce(new Error('database write failed'))
        .mockResolvedValueOnce(recovered),
      markRefundRequestFailed: vi.fn().mockResolvedValue(failed),
      restoreCompletedAfterRejectedRefund: vi.fn(),
    };
    const lessons = { refundPurchase: vi.fn().mockResolvedValue(undefined) };

    await expect(
      service(repository, lessons).approveRefundRequest(
        institutionId,
        refundId,
        { expectedRevision: 1 },
        actor,
      ),
    ).rejects.toThrow('database write failed');
    expect(lessons.refundPurchase).toHaveBeenCalledOnce();
    expect(repository.markEntitlementRecovered).toHaveBeenCalledTimes(2);
    expect(repository.markRefundRequestFailed).toHaveBeenCalledWith(
      refundId,
      'finalization',
      'LESSON_ORDER_REFUND_FAILED',
      '退款处理失败，请核查后重试',
      expect.anything(),
    );
    expect(repository.restoreCompletedAfterRejectedRefund).not.toHaveBeenCalled();
  });

  it('forbids cancelling a failed request after rights have been recovered', async () => {
    const repository = {
      lockRefundRequest: vi.fn().mockResolvedValue(
        refund('failed', {
          entitlementRecoveredAt: now,
          failureStage: 'funds_refund',
          failureCode: 'PAYMENT_REFUND_FAILED',
          failureMessage: '渠道退款失败',
        }),
      ),
      cancelRefundRequest: vi.fn(),
    };

    await expect(
      service(repository).cancelRefundRequest(
        institutionId,
        refundId,
        { expectedRevision: 4, reason: '取消申请' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'LESSON_ORDER_REFUND_CANNOT_CANCEL_AFTER_RECOVERY' });
    expect(repository.cancelRefundRequest).not.toHaveBeenCalled();
  });
});
