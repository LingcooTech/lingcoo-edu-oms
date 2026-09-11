import { describe, expect, it } from 'vitest';

import { LessonProductsService } from '../src/modules/lesson-products/application/lesson-products.service.js';
import type { LessonPackageVersionSnapshot } from '../src/modules/lesson-products/domain/model.js';
import { assertValidLessonPackageOnlineSaleWindow } from '../src/modules/lesson-products/domain/online-sale.js';

describe('lesson package online sale window', () => {
  it('allows unbounded and chronological sales windows', () => {
    expect(() =>
      assertValidLessonPackageOnlineSaleWindow({ saleStartsAt: null, saleEndsAt: null }),
    ).not.toThrow();
    expect(() =>
      assertValidLessonPackageOnlineSaleWindow({
        saleStartsAt: new Date('2026-10-01T00:00:00.000Z'),
        saleEndsAt: new Date('2026-10-31T23:59:59.000Z'),
      }),
    ).not.toThrow();
  });

  it('rejects an end that is not after the start', () => {
    expect(() =>
      assertValidLessonPackageOnlineSaleWindow({
        saleStartsAt: new Date('2026-10-01T00:00:00.000Z'),
        saleEndsAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'LESSON_PACKAGE_SALE_WINDOW_INVALID' }));
  });
});

describe('LessonProductsService.getPurchasableVersion', () => {
  const institutionId = '11111111-1111-4111-8111-111111111111';
  const packageId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-10-15T12:00:00.000Z');
  const snapshot: LessonPackageVersionSnapshot = {
    id: '33333333-3333-4333-8333-333333333333',
    packageId,
    institutionId,
    version: 2,
    name: '通用课时 20 节',
    description: null,
    baseUnits: 20,
    bonusUnits: 2,
    priceAmount: 12_800,
    currency: 'CNY',
    onlineSaleEnabled: true,
    saleStartsAt: new Date('2026-10-01T00:00:00.000Z'),
    saleEndsAt: new Date('2026-10-31T23:59:59.000Z'),
    status: 'active',
    createdAt: now,
  };

  function serviceFor(overrides: Partial<LessonPackageVersionSnapshot> = {}) {
    const record = {
      ...snapshot,
      ...overrides,
      revision: snapshot.version,
      createdAt: now,
      updatedAt: now,
    };
    const repository = {
      findForInstitution: async () => record,
      findVersion: async () => snapshot,
    };
    return new LessonProductsService({} as never, repository as never, {} as never, {} as never);
  }

  it('returns the current immutable version only when the template is purchasable', async () => {
    await expect(
      serviceFor().getPurchasableVersion(institutionId, packageId, {} as never, now),
    ).resolves.toBe(snapshot);
  });

  it.each([
    [{ status: 'inactive' as const }, 'LESSON_PACKAGE_INACTIVE'],
    [{ onlineSaleEnabled: false }, 'LESSON_PACKAGE_ONLINE_SALE_DISABLED'],
    [{ priceAmount: 0 }, 'LESSON_PACKAGE_PRICE_INVALID'],
    [{ saleStartsAt: new Date('2026-10-16T00:00:00.000Z') }, 'LESSON_PACKAGE_SALE_NOT_STARTED'],
    [{ saleEndsAt: new Date('2026-10-15T12:00:00.000Z') }, 'LESSON_PACKAGE_SALE_ENDED'],
  ])('rejects %o with %s', async (overrides, code) => {
    await expect(
      serviceFor(overrides).getPurchasableVersion(institutionId, packageId, {} as never, now),
    ).rejects.toThrowError(expect.objectContaining({ code }));
  });
});

describe('LessonProductsService.listPurchasable', () => {
  const institutionId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-10-15T12:00:00.000Z');

  it('delegates the current instant to the purchasable-product query and returns public views', async () => {
    const record = {
      id: '33333333-3333-4333-8333-333333333333',
      institutionId,
      name: '通用课时 20 节',
      description: null,
      baseUnits: 20,
      bonusUnits: 2,
      priceAmount: 12_800,
      currency: 'CNY' as const,
      onlineSaleEnabled: true,
      saleStartsAt: new Date('2026-10-01T00:00:00.000Z'),
      saleEndsAt: new Date('2026-10-31T23:59:59.000Z'),
      status: 'active' as const,
      revision: 2,
      createdAt: now,
      updatedAt: now,
    };
    const calls: Array<{ institutionId: string; now: Date }> = [];
    const repository = {
      listPurchasable: async (requestedInstitutionId: string, requestedNow: Date) => {
        calls.push({ institutionId: requestedInstitutionId, now: requestedNow });
        return [record];
      },
    };
    const service = new LessonProductsService(
      {} as never,
      repository as never,
      {} as never,
      {} as never,
    );

    await expect(service.listPurchasable(institutionId, now)).resolves.toEqual([
      {
        ...record,
        saleStartsAt: '2026-10-01T00:00:00.000Z',
        saleEndsAt: '2026-10-31T23:59:59.000Z',
        createdAt: '2026-10-15T12:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z',
      },
    ]);
    expect(calls).toEqual([{ institutionId, now }]);
  });
});

describe('LessonProductsService.getVersion', () => {
  const institutionId = '11111111-1111-4111-8111-111111111111';
  const packageId = '22222222-2222-4222-8222-222222222222';
  const snapshot = {
    id: '33333333-3333-4333-8333-333333333333',
    packageId,
    institutionId,
    version: 1,
    name: '已停售的历史课时包',
    description: null,
    baseUnits: 10,
    bonusUnits: 0,
    priceAmount: 9_900,
    currency: 'CNY' as const,
    onlineSaleEnabled: true,
    saleStartsAt: null,
    saleEndsAt: null,
    status: 'active' as const,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  function serviceFor(options: { foundPackage?: boolean; foundVersion?: boolean } = {}) {
    const repository = {
      findForInstitution: async () =>
        options.foundPackage === false
          ? null
          : {
              id: packageId,
              institutionId,
              revision: 2,
            },
      findVersion: async () => (options.foundVersion === false ? null : snapshot),
    };
    return new LessonProductsService({} as never, repository as never, {} as never, {} as never);
  }

  it('returns the requested immutable version without applying current sales rules', async () => {
    await expect(serviceFor().getVersion(institutionId, packageId, 1, {} as never)).resolves.toBe(
      snapshot,
    );
  });

  it('keeps the requested package institution-scoped and reports missing versions', async () => {
    await expect(
      serviceFor({ foundPackage: false }).getVersion(institutionId, packageId, 1, {} as never),
    ).rejects.toThrowError(expect.objectContaining({ code: 'LESSON_PACKAGE_NOT_FOUND' }));
    await expect(
      serviceFor({ foundVersion: false }).getVersion(institutionId, packageId, 99, {} as never),
    ).rejects.toThrowError(expect.objectContaining({ code: 'LESSON_PACKAGE_VERSION_NOT_FOUND' }));
  });
});
