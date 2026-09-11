import { createLessonAccountsApi, createLessonPackagesApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';

const institutionId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const packageId = '33333333-3333-4333-8333-333333333333';
const accountId = '44444444-4444-4444-8444-444444444444';
const movementId = '55555555-5555-4555-8555-555555555555';
const batchId = '66666666-6666-4666-8666-666666666666';
const now = '2026-09-06T00:00:00.000Z';

const account = {
  id: accountId,
  institutionId,
  studentId,
  balanceUnits: 10,
  lifetimeCreditedUnits: 10,
  lifetimeDebitedUnits: 0,
  activeBatchCount: 1,
  revision: 2,
  createdAt: now,
  updatedAt: now,
};
const batch = {
  id: batchId,
  accountId,
  institutionId,
  studentId,
  originMovementId: movementId,
  templateId: packageId,
  templateRevision: 1,
  templateName: '通用 10 课时',
  sourceType: 'offline_purchase',
  sourceReference: 'OFFLINE-1',
  reason: '线下购课',
  baseUnits: 10,
  bonusUnits: 0,
  totalUnits: 10,
  consumedUnits: 0,
  withdrawnUnits: 0,
  remainingUnits: 10,
  status: 'available',
  createdAt: now,
  updatedAt: now,
};
const movement = {
  id: movementId,
  accountId,
  institutionId,
  studentId,
  type: 'grant',
  direction: 'credit',
  units: 10,
  balanceBeforeUnits: 0,
  balanceAfterUnits: 10,
  reason: '线下购课',
  sourceReference: 'OFFLINE-1',
  allocations: [],
  actorId: null,
  occurredAt: now,
};

describe('P3 lesson API clients', () => {
  it('addresses package templates inside an institution', async () => {
    const response = {
      id: packageId,
      institutionId,
      name: '通用 10 课时',
      description: null,
      baseUnits: 10,
      bonusUnits: 0,
      priceAmount: 9_900,
      currency: 'CNY',
      onlineSaleEnabled: true,
      saleStartsAt: null,
      saleEndsAt: null,
      status: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 201 }));
    const api = createLessonPackagesApi(createApiClient({ fetch }));

    await api.create(institutionId, {
      name: response.name,
      baseUnits: 10,
      priceAmount: 9_900,
      onlineSaleEnabled: true,
    });

    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/institutions/${institutionId}/lesson-packages`);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      name: response.name,
      description: null,
      baseUnits: 10,
      bonusUnits: 0,
      priceAmount: 9_900,
      currency: 'CNY',
      onlineSaleEnabled: true,
      saleStartsAt: null,
      saleEndsAt: null,
    });
  });

  it('sends account revision and idempotency evidence in headers', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ account, movement, affectedBatches: [batch] }), {
        status: 201,
      }),
    );
    const api = createLessonAccountsApi(createApiClient({ fetch }));

    await api.grant(
      institutionId,
      studentId,
      {
        templateId: packageId,
        source: 'gift',
        sourceReference: 'GIFT-1',
        reason: '活动赠送',
      },
      { expectedAccountRevision: 0, idempotencyKey: 'grant-0001' },
    );

    const headers = fetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('idempotency-key')).toBe('grant-0001');
    expect(headers.get('x-expected-account-revision')).toBe('0');
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `/api/institutions/${institutionId}/students/${studentId}/lesson-grants`,
    );
  });

  it('allows an empty account response without manufacturing a persisted balance', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('null', { status: 200 }));
    const api = createLessonAccountsApi(createApiClient({ fetch }));
    await expect(api.get(institutionId, studentId)).resolves.toBeNull();
  });
});
