import { describe, expect, it, vi } from 'vitest';

import { LessonCommerceService } from '../src/modules/lesson-commerce/application/lesson-commerce.service.js';

function fixture() {
  const now = new Date('2026-09-11T08:00:00.000Z');
  const order = {
    id: '11111111-1111-4111-8111-111111111111',
    orderNo: 'LE20260911160000ABCDEF123456',
    institutionId: '22222222-2222-4222-8222-222222222222',
    studentId: '33333333-3333-4333-8333-333333333333',
    studentName: '小满',
    guardianId: '44444444-4444-4444-8444-444444444444',
    guardianName: '小满妈妈',
    createdByUserId: '55555555-5555-4555-8555-555555555555',
    packageId: '66666666-6666-4666-8666-666666666666',
    packageVersionId: '77777777-7777-4777-8777-777777777777',
    packageVersion: 3,
    packageName: '通用课时 20 节',
    baseUnits: 20,
    bonusUnits: 2,
    channel: 'online' as const,
    listedAmountMinor: 12_800,
    amountMinor: 12_800,
    currency: 'CNY' as const,
    provider: 'mock' as const,
    paymentMethod: 'mock' as const,
    paymentReference: null,
    paymentNote: null,
    priceAdjustmentReason: null,
    receiptNo: 'RC20260911160000ABCDEF123456',
    paymentIntentId: '88888888-8888-4888-8888-888888888888',
    grantMovementId: null as string | null,
    status: 'pending_payment' as
      'pending_payment' | 'paid_pending_grant' | 'completed' | 'grant_failed',
    failureCode: null as string | null,
    failureMessage: null as string | null,
    paidAt: null as Date | null,
    completedAt: null as Date | null,
    closedAt: null as Date | null,
    expiresAt: new Date('2026-09-11T08:30:00.000Z'),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const repository = {
    findByOrderNo: vi.fn(async () => order),
    lockById: vi.fn(async () => order),
    markPaid: vi.fn(async (_id: string, paidAt: Date) => {
      order.status = 'paid_pending_grant';
      order.paidAt = paidAt;
      return order;
    }),
    markCompleted: vi.fn(async (_id: string, movementId: string) => {
      order.status = 'completed';
      order.grantMovementId = movementId;
      order.completedAt = now;
      return order;
    }),
    markGrantFailed: vi.fn(async () => order),
  };
  const lessons = {
    grantPurchase: vi.fn(async () => ({
      movement: {
        id: '99999999-9999-4999-8999-999999999999',
        units: 22,
      },
    })),
  };
  const database = {
    transaction: (work: (transaction: never) => Promise<unknown>) => work({} as never),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new LessonCommerceService(
    database as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    lessons as never,
    {} as never,
    {} as never,
    {} as never,
    audit as never,
    { getValue: vi.fn(async () => true), publicValues: vi.fn(async () => ({})) } as never,
    () => now,
  );
  return { service, order, repository, lessons };
}

describe('LessonCommerceService payment facts', () => {
  it('grants the snapshotted package exactly once for duplicate successful facts', async () => {
    const { service, order, repository, lessons } = fixture();
    const fact = {
      intentId: order.paymentIntentId!,
      merchantReference: order.orderNo,
      status: 'succeeded' as const,
      amountMinor: order.amountMinor,
      refundedAmountMinor: 0,
      currency: order.currency,
      occurredAt: new Date('2026-09-11T08:05:00.000Z'),
    };

    await service.receive(fact);
    await service.receive(fact);

    expect(lessons.grantPurchase).toHaveBeenCalledTimes(1);
    expect(lessons.grantPurchase).toHaveBeenCalledWith(
      {
        institutionId: order.institutionId,
        studentId: order.studentId,
        packageId: order.packageId,
        packageVersion: 3,
        orderNo: order.orderNo,
        source: 'online_purchase',
      },
      expect.objectContaining({ actorId: order.createdByUserId }),
    );
    expect(repository.markCompleted).toHaveBeenCalledTimes(1);
    expect(order.status).toBe('completed');
  });

  it('rejects a paid fact whose amount differs from the immutable order snapshot', async () => {
    const { service, order, lessons } = fixture();
    await expect(
      service.receive({
        intentId: order.paymentIntentId!,
        merchantReference: order.orderNo,
        status: 'succeeded',
        amountMinor: order.amountMinor + 1,
        refundedAmountMinor: 0,
        currency: order.currency,
        occurredAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: 'LESSON_ORDER_PAYMENT_AMOUNT_MISMATCH' });
    expect(lessons.grantPurchase).not.toHaveBeenCalled();
  });

  it('blocks generic payment refunds until a dedicated lesson reversal workflow exists', async () => {
    const { service, order } = fixture();

    await expect(
      service.assertRefundAllowed({ merchantReference: order.orderNo }),
    ).rejects.toMatchObject({ code: 'LESSON_ORDER_REFUND_WORKFLOW_REQUIRED' });
  });
});
