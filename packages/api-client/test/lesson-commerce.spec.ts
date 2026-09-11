import { createApiClient, createLessonCommerceApi } from '@lingcoo-edu-oms/api-client';
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
    packageId: '55555555-5555-4555-8555-555555555555',
    packageVersionId: '66666666-6666-4666-8666-666666666666',
    packageVersion: 2,
    packageName: '通用课时包',
    baseUnits: 20,
    bonusUnits: 2,
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
  it('lists institution orders and requests a grant retry with CSRF', async () => {
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
      );
    const api = createLessonCommerceApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-token' }),
    );
    const institutionId = '22222222-2222-4222-8222-222222222222';

    await api.list(institutionId, { status: 'grant_failed' });
    await api.retryGrant(institutionId, order().id);

    expect(fetch.mock.calls[0]?.[0]).toContain(
      `/api/institutions/${institutionId}/orders?page=1&pageSize=20&status=grant_failed`,
    );
    const retry = fetch.mock.calls[1];
    expect(retry?.[0]).toContain(`/orders/${order().id}/actions/retry-grant`);
    expect(new Headers(retry?.[1]?.headers).get('x-csrf-token')).toBe('csrf-token');
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
    expect(fetch.mock.calls[1]?.[0]).toContain(`/orders/${offlineOrder.id}/receipt`);
  });
});
