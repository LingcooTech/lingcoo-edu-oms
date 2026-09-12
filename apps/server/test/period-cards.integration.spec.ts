import { describe, expect, it } from 'vitest';

import {
  addPeriodDurationUtc,
  effectivePeriodCardStatus,
} from '../src/modules/period-cards/domain/model.js';

describe('period card domain invariants', () => {
  it('adds calendar months in UTC and clamps month-end without changing clock time', () => {
    expect(
      addPeriodDurationUtc(new Date('2024-01-31T08:30:45.123Z'), 'month', 1).toISOString(),
    ).toBe('2024-02-29T08:30:45.123Z');
    expect(
      addPeriodDurationUtc(new Date('2025-01-31T08:30:45.123Z'), 'month', 1).toISOString(),
    ).toBe('2025-02-28T08:30:45.123Z');
    expect(
      addPeriodDurationUtc(new Date('2025-12-31T23:59:59.999Z'), 'month', 2).toISOString(),
    ).toBe('2026-02-28T23:59:59.999Z');
  });

  it('adds day and week durations using UTC calendar days', () => {
    const startsAt = new Date('2026-03-01T00:00:00.000Z');
    expect(addPeriodDurationUtc(startsAt, 'day', 2).toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(addPeriodDurationUtc(startsAt, 'week', 2).toISOString()).toBe(
      '2026-03-15T00:00:00.000Z',
    );
  });

  it('treats the interval as start-inclusive and end-exclusive', () => {
    const entitlement = {
      lifecycleState: 'active' as const,
      activationStartsAt: '2026-04-01T00:00:00.000Z',
      endsAt: '2026-05-01T00:00:00.000Z',
      mode: 'unlimited' as const,
      usageLimit: null,
      usedQuantity: 99,
    };
    expect(effectivePeriodCardStatus(entitlement, new Date('2026-03-31T23:59:59.999Z'))).toBe(
      'pending_activation',
    );
    expect(effectivePeriodCardStatus(entitlement, new Date('2026-04-01T00:00:00.000Z'))).toBe(
      'active',
    );
    expect(effectivePeriodCardStatus(entitlement, new Date('2026-05-01T00:00:00.000Z'))).toBe(
      'expired',
    );
  });

  it('derives pending, exhausted and revoked statuses without mutating lifecycle state', () => {
    const base = {
      lifecycleState: 'active' as const,
      activationStartsAt: null,
      endsAt: null,
      mode: 'limited' as const,
      usageLimit: 3,
      usedQuantity: 0,
    };
    expect(effectivePeriodCardStatus(base, new Date('2026-01-01T00:00:00.000Z'))).toBe(
      'pending_activation',
    );
    expect(
      effectivePeriodCardStatus(
        {
          ...base,
          activationStartsAt: '2026-01-01T00:00:00.000Z',
          endsAt: '2027-01-01T00:00:00.000Z',
          usedQuantity: 3,
        },
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    ).toBe('exhausted');
    expect(
      effectivePeriodCardStatus(
        { ...base, lifecycleState: 'revoked' },
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toBe('revoked');
  });
});
