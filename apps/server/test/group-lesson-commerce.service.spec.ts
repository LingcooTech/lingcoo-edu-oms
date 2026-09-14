import { describe, expect, it, vi } from 'vitest';

import { LessonCommerceService } from '../src/modules/lesson-commerce/application/lesson-commerce.service.js';

const NOW = new Date('2026-09-14T03:00:00.000Z');
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222';
const FORMATION_ID = '33333333-3333-4333-8333-333333333333';
const STUDENT_ID = '44444444-4444-4444-8444-444444444444';
const GUARDIAN_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_ID = '66666666-6666-4666-8666-666666666666';
const PACKAGE_ID = '77777777-7777-4777-8777-777777777777';
const VERSION_ID = '88888888-8888-4888-8888-888888888888';
const INTENT_ID = '99999999-9999-4999-8999-999999999999';

function orderFixture() {
  return {
    id: ORDER_ID,
    orderNo: 'LE20260914110000GROUPORDER01',
    institutionId: INSTITUTION_ID,
    studentId: STUDENT_ID,
    studentName: '小满',
    guardianId: GUARDIAN_ID,
    guardianName: '小满妈妈',
    createdByUserId: ACTOR_ID,
    sourceType: 'group_formation' as const,
    sourceReferenceId: FORMATION_ID,
    productType: 'lesson_package' as const,
    packageId: PACKAGE_ID,
    packageVersionId: VERSION_ID,
    packageVersion: 1,
    packageName: '秋季书法拼课 · 2 人成班',
    baseUnits: 16,
    bonusUnits: 0,
    periodCardProductId: null,
    periodCardProductVersionId: null,
    periodCardProductVersion: null,
    periodCardProductName: null,
    periodCardMode: null,
    periodCardUsageLimit: null,
    periodCardDurationUnit: null,
    periodCardDurationCount: null,
    periodCardActivationPolicy: null,
    channel: 'pending' as 'pending' | 'online' | 'offline',
    listedAmountMinor: 900,
    amountMinor: 900,
    depositAppliedMinor: 100,
    balanceDueMinor: 800,
    currency: 'CNY' as const,
    provider: null as 'mock' | 'wechat_pay' | null,
    paymentMethod: 'pending' as
      'pending' | 'mock' | 'wechat_pay' | 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other',
    paymentReference: null as string | null,
    paymentNote: null as string | null,
    priceAdjustmentReason: null,
    receiptNo: 'RC20260914110000GROUP01',
    paymentIntentId: null as string | null,
    grantMovementId: null as string | null,
    periodCardEntitlementId: null,
    status: 'awaiting_settlement' as
      | 'awaiting_settlement'
      | 'pending_payment'
      | 'paid_pending_grant'
      | 'completed'
      | 'grant_failed',
    failureCode: null as string | null,
    failureMessage: null as string | null,
    paidAt: null as Date | null,
    completedAt: null as Date | null,
    closedAt: null,
    expiresAt: null as Date | null,
    paymentDeadlineAt: new Date('2026-09-20T00:00:00.000Z'),
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fixture() {
  const order = orderFixture();
  const repository = {
    findById: vi.fn(async () => order),
    findByOrderNo: vi.fn(async () => order),
    findByPaymentIntentId: vi.fn(async () => (order.paymentIntentId === INTENT_ID ? order : null)),
    lockById: vi.fn(async () => order),
    prepareOnlineSettlement: vi.fn(async () => {
      order.status = 'pending_payment';
      order.channel = 'online';
      order.provider = 'mock';
      order.paymentMethod = 'mock';
      order.expiresAt = new Date(NOW.getTime() + 30 * 60_000);
      order.revision += 1;
      return order;
    }),
    attachPaymentIntent: vi.fn(async () => {
      order.paymentIntentId = INTENT_ID;
      order.revision += 1;
      return order;
    }),
    recordOfflineSettlement: vi.fn(
      async (
        _id: string,
        _revision: number,
        input: {
          paymentMethod: typeof order.paymentMethod;
          paymentReference?: string | null;
          paymentNote?: string | null;
          paidAt: Date;
        },
      ) => {
        order.status = 'paid_pending_grant';
        order.channel = 'offline';
        order.paymentMethod = input.paymentMethod;
        order.paymentReference = input.paymentReference ?? null;
        order.paymentNote = input.paymentNote ?? null;
        order.paidAt = input.paidAt;
        order.revision += 1;
        return order;
      },
    ),
    markPaid: vi.fn(async (_id: string, paidAt: Date) => {
      order.status = 'paid_pending_grant';
      order.paidAt = paidAt;
      order.revision += 1;
      return order;
    }),
    markLessonCompleted: vi.fn(async (_id: string, movementId: string) => {
      order.status = 'completed';
      order.grantMovementId = movementId;
      order.completedAt = NOW;
      order.revision += 1;
      return order;
    }),
    markGrantFailed: vi.fn(async () => order),
  };
  const payments = {
    createIntent: vi.fn(async () => ({ id: INTENT_ID })),
    getIntent: vi.fn(async () => ({ id: INTENT_ID })),
  };
  const lessons = {
    grantPurchase: vi.fn(async () => ({
      movement: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', units: 16 },
    })),
  };
  const service = new LessonCommerceService(
    { transaction: (work: (transaction: never) => Promise<unknown>) => work({} as never) } as never,
    repository as never,
    { assertActiveInstitution: vi.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    lessons as never,
    payments as never,
    {} as never,
    {} as never,
    { record: vi.fn() } as never,
    { getValue: vi.fn(async () => true) } as never,
    () => NOW,
  );
  return { service, order, repository, payments, lessons };
}

describe('group formation order settlement', () => {
  it('creates an online payment for the balance only and grants after its payment fact', async () => {
    const { service, order, payments, lessons } = fixture();

    await service.startGroupOnlinePaymentForInstitution(
      INSTITUTION_ID,
      ORDER_ID,
      { provider: 'mock' },
      { actorType: 'user', actorId: ACTOR_ID },
    );

    expect(payments.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantReference: expect.stringContaining(`${order.orderNo}:balance:`),
        amountMinor: 800,
      }),
      expect.anything(),
      expect.anything(),
    );
    await service.receive({
      intentId: INTENT_ID,
      merchantReference: `${order.orderNo}:balance:2`,
      status: 'succeeded',
      amountMinor: 800,
      refundedAmountMinor: 0,
      currency: 'CNY',
      occurredAt: NOW,
    });

    expect(lessons.grantPurchase).toHaveBeenCalledTimes(1);
    expect(order.status).toBe('completed');
  });

  it('records the exact offline balance and immediately grants the package', async () => {
    const { service, order, repository, lessons } = fixture();

    await expect(
      service.recordGroupOfflineSettlement(
        INSTITUTION_ID,
        ORDER_ID,
        {
          expectedRevision: order.revision,
          paidAmountMinor: 799,
          paymentMethod: 'cash',
          paidAt: NOW.toISOString(),
        },
        { actorType: 'user', actorId: ACTOR_ID },
      ),
    ).rejects.toMatchObject({ code: 'GROUP_ORDER_BALANCE_AMOUNT_MISMATCH' });

    const result = await service.recordGroupOfflineSettlement(
      INSTITUTION_ID,
      ORDER_ID,
      {
        expectedRevision: order.revision,
        paidAmountMinor: 800,
        paymentMethod: 'bank_transfer',
        paidAt: NOW.toISOString(),
        paymentReference: 'BANK-20260914-001',
      },
      { actorType: 'user', actorId: ACTOR_ID },
    );

    expect(repository.recordOfflineSettlement).toHaveBeenCalledTimes(1);
    expect(lessons.grantPurchase).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
    expect(result.amountMinor).toBe(result.depositAppliedMinor + result.balanceDueMinor);
  });
});
