import { createApiClient, createLessonCommerceApi } from '@lingcoo-edu-oms/api-client';
import { createLessonOrderRequestSchema } from '@lingcoo-edu-oms/contracts';
import { describe, expect, it, vi } from 'vitest';

function order() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    orderNo: 'LE20260911160000ABCDEF123456',
    institutionId: '22222222-2222-4222-8222-222222222222',
    studentId: '33333333-3333-4333-8333-333333333333',
    studentName: '小满',
    guardianId: '44444444-4444-4444-8444-444444444444',
    guardianName: '小满妈妈',
    productType: 'lesson_package',
    packageId: '55555555-5555-4555-8555-555555555555',
    packageVersionId: '66666666-6666-4666-8666-666666666666',
    packageVersion: 2,
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
    channel: 'online',
    listedAmountMinor: 12_800,
    amountMinor: 12_800,
    currency: 'CNY',
    provider: 'mock',
    paymentMethod: 'mock',
    paymentReference: null,
    paymentNote: null,
    priceAdjustmentReason: null,
    receiptNo: 'RC20260911160000ABCDEF123456',
    paymentIntentId: null,
    grantMovementId: null,
    periodCardEntitlementId: null,
    status: 'grant_failed',
    failureCode: 'TEMPORARY_ERROR',
    failureMessage: '暂时失败',
    paidAt: '2026-09-11T08:05:00.000Z',
    completedAt: null,
    closedAt: null,
    expiresAt: '2026-09-11T08:30:00.000Z',
    revision: 3,
    createdAt: '2026-09-11T08:00:00.000Z',
    updatedAt: '2026-09-11T08:06:00.000Z',
  };
}

describe('lesson commerce API client', () => {
  it('drives the refund request, approval and offline confirmation endpoints', async () => {
    const baseRefund = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requestNo: 'RF202609141000001234',
      requestKey: 'refund-request-001',
      orderId: order().id,
      orderNo: order().orderNo,
      institutionId: order().institutionId,
      studentId: order().studentId,
      studentName: order().studentName,
      guardianId: order().guardianId,
      guardianName: order().guardianName,
      productType: 'lesson_package',
      channel: 'offline',
      amountMinor: 12_800,
      currency: 'CNY',
      reason: '家长取消课程',
      status: 'requested',
      requestedByUserId: order().guardianId,
      reviewedByUserId: null,
      reviewNote: null,
      offlineRefundMethod: null,
      offlineRefundReference: null,
      offlineRefundNote: null,
      paymentRefundId: null,
      failureStage: null,
      failureCode: null,
      failureMessage: null,
      requestedAt: '2026-09-14T02:00:00.000Z',
      approvedAt: null,
      rejectedAt: null,
      cancelledAt: null,
      entitlementRecoveredAt: null,
      fundsRefundedAt: null,
      completedAt: null,
      revision: 1,
      createdAt: '2026-09-14T02:00:00.000Z',
      updatedAt: '2026-09-14T02:00:00.000Z',
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(baseRefund))
      .mockResolvedValueOnce(
        Response.json({
          ...baseRefund,
          status: 'awaiting_offline_refund',
          reviewedByUserId: order().guardianId,
          approvedAt: baseRefund.requestedAt,
          entitlementRecoveredAt: baseRefund.requestedAt,
          revision: 4,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...baseRefund,
          status: 'completed',
          reviewedByUserId: order().guardianId,
          approvedAt: baseRefund.requestedAt,
          entitlementRecoveredAt: baseRefund.requestedAt,
          fundsRefundedAt: baseRefund.requestedAt,
          completedAt: baseRefund.requestedAt,
          offlineRefundMethod: 'wechat_transfer',
          offlineRefundNote: '已退回',
          revision: 6,
        }),
      );
    const api = createLessonCommerceApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-token' }),
    );

    await api.requestRefund(order().institutionId, order().id, {
      expectedOrderRevision: 4,
      requestKey: baseRefund.requestKey,
      reason: baseRefund.reason,
    });
    await api.approveRefund(order().institutionId, baseRefund.id, {
      expectedRevision: 1,
      note: '同意全额退款',
    });
    await api.confirmOfflineRefund(order().institutionId, baseRefund.id, {
      expectedRevision: 4,
      paymentMethod: 'wechat_transfer',
      note: '已退回',
    });

    expect(fetch.mock.calls[0]?.[0]).toContain(`/orders/${order().id}/refunds`);
    expect(fetch.mock.calls[1]?.[0]).toContain(`/refunds/${baseRefund.id}/actions/approve`);
    expect(fetch.mock.calls[2]?.[0]).toContain(`/refunds/${baseRefund.id}/actions/confirm-offline`);
  });

  it('normalizes the legacy online payload and accepts a period card product', () => {
    const institutionId = '22222222-2222-4222-8222-222222222222';
    const studentId = '33333333-3333-4333-8333-333333333333';
    const packageId = '55555555-5555-4555-8555-555555555555';
    const periodCardProductId = '88888888-8888-4888-8888-888888888888';

    expect(
      createLessonOrderRequestSchema.parse({ institutionId, studentId, packageId }),
    ).toMatchObject({ productType: 'lesson_package', packageId });
    expect(
      createLessonOrderRequestSchema.parse({
        institutionId,
        studentId,
        productType: 'period_card',
        periodCardProductId,
      }),
    ).toMatchObject({ productType: 'period_card', periodCardProductId });
  });

  it('lists institution orders and requests grant retry and refund with CSRF', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    fetch
      .mockResolvedValueOnce(Response.json({ items: [order()], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(
        Response.json({
          ...order(),
          status: 'completed',
          failureCode: null,
          failureMessage: null,
          grantMovementId: '77777777-7777-4777-8777-777777777777',
          completedAt: '2026-09-11T08:07:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...order(),
          status: 'refunded',
          failureCode: null,
          failureMessage: null,
          grantMovementId: '77777777-7777-4777-8777-777777777777',
          completedAt: null,
          revision: 5,
        }),
      );
    const api = createLessonCommerceApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-token' }),
    );
    const institutionId = '22222222-2222-4222-8222-222222222222';

    await api.list(institutionId, { productType: 'period_card', status: 'grant_failed' });
    await api.retryGrant(institutionId, order().id);
    await api.refund(institutionId, order().id, {
      expectedRevision: 4,
      reason: '家长申请退款',
    });

    expect(fetch.mock.calls[0]?.[0]).toContain(
      `/api/institutions/${institutionId}/orders?page=1&pageSize=20&productType=period_card&status=grant_failed`,
    );
    const retry = fetch.mock.calls[1];
    expect(retry?.[0]).toContain(`/orders/${order().id}/actions/retry-grant`);
    expect(new Headers(retry?.[1]?.headers).get('x-csrf-token')).toBe('csrf-token');
    const refund = fetch.mock.calls[2];
    expect(refund?.[0]).toContain(`/orders/${order().id}/actions/refund`);
    expect(new Headers(refund?.[1]?.headers).get('x-csrf-token')).toBe('csrf-token');
    expect(JSON.parse(String(refund?.[1]?.body))).toEqual({
      expectedRevision: 4,
      reason: '家长申请退款',
    });
  });

  it('creates an offline order idempotently and loads its receipt', async () => {
    const offlineOrder = {
      ...order(),
      channel: 'offline',
      listedAmountMinor: 12_800,
      provider: null,
      paymentMethod: 'cash',
      paymentReference: 'CASH-001',
      paymentNote: '前台收款',
      status: 'completed',
      failureCode: null,
      failureMessage: null,
      grantMovementId: '77777777-7777-4777-8777-777777777777',
      completedAt: '2026-09-11T08:07:00.000Z',
      expiresAt: null,
    };
    const receipt = {
      receiptNo: offlineOrder.receiptNo,
      title: '收据',
      issuedAt: offlineOrder.completedAt,
      settlementMark: '现金收讫',
      amountUppercase: '壹佰贰拾捌元整',
      organization: {
        name: '灵可教育',
        brandName: '灵可',
        logoUrl: null,
        phone: null,
        address: null,
      },
      institution: {
        id: offlineOrder.institutionId,
        name: '成长空间',
        phone: null,
        address: null,
      },
      order: offlineOrder,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(offlineOrder))
      .mockResolvedValueOnce(Response.json(receipt));
    const api = createLessonCommerceApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-token' }),
    );

    await api.createOffline(
      offlineOrder.institutionId,
      {
        student: {
          kind: 'existing',
          studentId: offlineOrder.studentId,
          guardianId: offlineOrder.guardianId,
        },
        packageId: offlineOrder.packageId,
        paidAmountMinor: offlineOrder.amountMinor,
        paymentMethod: 'cash',
        receivedAt: offlineOrder.paidAt,
      },
      'offline-order-key',
    );
    await api.receipt(offlineOrder.institutionId, offlineOrder.id);

    const createRequest = fetch.mock.calls[0];
    expect(createRequest?.[0]).toContain('/orders/offline');
    expect(new Headers(createRequest?.[1]?.headers).get('idempotency-key')).toBe(
      'offline-order-key',
    );
    expect(JSON.parse(String(createRequest?.[1]?.body))).toMatchObject({
      productType: 'lesson_package',
      packageId: offlineOrder.packageId,
    });
    expect(fetch.mock.calls[1]?.[0]).toContain(`/orders/${offlineOrder.id}/receipt`);
  });

  it('creates a period card offline order without lesson package fields', async () => {
    const periodCardOrder = {
      ...order(),
      productType: 'period_card',
      packageId: null,
      packageVersionId: null,
      packageVersion: null,
      packageName: null,
      baseUnits: null,
      bonusUnits: null,
      periodCardProductId: '88888888-8888-4888-8888-888888888888',
      periodCardProductVersionId: '99999999-9999-4999-8999-999999999999',
      periodCardProductVersion: 1,
      periodCardProductName: '成长空间月卡',
      periodCardMode: 'limited',
      periodCardUsageLimit: 12,
      periodCardDurationUnit: 'month',
      periodCardDurationCount: 1,
      periodCardActivationPolicy: 'on_first_use',
      grantMovementId: null,
      periodCardEntitlementId: null,
      channel: 'offline',
      provider: null,
      paymentMethod: 'cash',
      status: 'completed',
      failureCode: null,
      failureMessage: null,
      expiresAt: null,
      completedAt: '2026-09-11T08:07:00.000Z',
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(periodCardOrder));
    const api = createLessonCommerceApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-token' }),
    );

    const result = await api.createOffline(
      periodCardOrder.institutionId,
      {
        student: {
          kind: 'existing',
          studentId: periodCardOrder.studentId,
          guardianId: periodCardOrder.guardianId,
        },
        productType: 'period_card',
        periodCardProductId: periodCardOrder.periodCardProductId,
        paidAmountMinor: periodCardOrder.amountMinor,
        paymentMethod: 'cash',
        receivedAt: periodCardOrder.paidAt,
      },
      'period-card-offline-order-key',
    );

    expect(result.productType).toBe('period_card');
    expect(result.periodCardProductId).toBe(periodCardOrder.periodCardProductId);
    expect(result.packageId).toBeNull();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({
      productType: 'period_card',
      periodCardProductId: periodCardOrder.periodCardProductId,
    });
  });
});
