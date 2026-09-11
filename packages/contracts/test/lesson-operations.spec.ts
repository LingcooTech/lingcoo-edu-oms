import { describe, expect, it } from 'vitest';

import {
  adjustLessonUnitsRequestSchema,
  createLessonPackageRequestSchema,
  grantLessonUnitsRequestSchema,
  lessonAccountMutationHeadersSchema,
  reverseLessonGrantRequestSchema,
} from '../src/index.js';

const templateId = '11111111-1111-4111-8111-111111111111';

describe('P3 lesson operation contracts', () => {
  it('keeps lesson packages institution-generic, integer based and ready for online sales', () => {
    const parsed = createLessonPackageRequestSchema.parse({
      name: '通用课时 20 节',
      description: null,
      baseUnits: 20,
      bonusUnits: 2,
      priceAmount: 12_800,
      onlineSaleEnabled: true,
      saleStartsAt: '2026-10-01T00:00:00.000Z',
      saleEndsAt: '2026-10-31T23:59:59.000Z',
      courseId: templateId,
      amount: 2_000,
    });
    expect(parsed).toEqual({
      name: '通用课时 20 节',
      description: null,
      baseUnits: 20,
      bonusUnits: 2,
      priceAmount: 12_800,
      currency: 'CNY',
      onlineSaleEnabled: true,
      saleStartsAt: '2026-10-01T00:00:00.000Z',
      saleEndsAt: '2026-10-31T23:59:59.000Z',
    });
    expect(
      createLessonPackageRequestSchema.safeParse({ name: '半节', baseUnits: 0.5 }).success,
    ).toBe(false);
    expect(
      createLessonPackageRequestSchema.safeParse({
        name: '窗口错误',
        baseUnits: 10,
        saleStartsAt: '2026-10-02T00:00:00.000Z',
        saleEndsAt: '2026-10-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('uses either an immutable template snapshot or explicit custom units', () => {
    expect(
      grantLessonUnitsRequestSchema.parse({
        templateId,
        source: 'offline_purchase',
        reason: '线下购课登记',
      }),
    ).toMatchObject({ templateId, sourceReference: null });
    expect(
      grantLessonUnitsRequestSchema.parse({
        templateId: null,
        baseUnits: 8,
        bonusUnits: 1,
        source: 'gift',
        reason: '活动赠送',
      }),
    ).toMatchObject({ templateId: null, baseUnits: 8, bonusUnits: 1 });
    expect(
      grantLessonUnitsRequestSchema.safeParse({
        templateId,
        baseUnits: 99,
        source: 'custom',
        reason: '试图覆盖模板数量',
      }).success,
    ).toBe(false);
  });

  it('requires positive integer movements, reasons, revisions and idempotency keys', () => {
    expect(
      lessonAccountMutationHeadersSchema.parse({
        'idempotency-key': 'grant-2026-0001',
        'x-expected-account-revision': '0',
      }),
    ).toEqual({
      'idempotency-key': 'grant-2026-0001',
      'x-expected-account-revision': 0,
    });
    expect(
      adjustLessonUnitsRequestSchema.safeParse({ direction: 'debit', units: 0, reason: '纠错' })
        .success,
    ).toBe(false);
    expect(reverseLessonGrantRequestSchema.safeParse({ reason: '' }).success).toBe(false);
  });
});
