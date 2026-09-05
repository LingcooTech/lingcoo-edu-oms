import {
  createPaymentIntentRequestSchema,
  createPaymentRefundRequestSchema,
  mockPaymentCallbackRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import { describe, expect, it } from 'vitest';

describe('payments contracts', () => {
  it('normalizes defaults and accepts integer minor units', () => {
    expect(
      createPaymentIntentRequestSchema.parse({
        merchantReference: 'order-1',
        amountMinor: 1250,
        description: 'Order 1',
      }),
    ).toMatchObject({ provider: 'mock', currency: 'CNY', amountMinor: 1250 });
  });

  it('rejects floating, negative, and malformed monetary values', () => {
    expect(
      createPaymentIntentRequestSchema.safeParse({
        merchantReference: 'x',
        amountMinor: 1.5,
        currency: 'cny',
        description: 'x',
      }).success,
    ).toBe(false);
    expect(
      createPaymentRefundRequestSchema.safeParse({
        requestKey: 'short',
        amountMinor: -1,
        reason: 'x',
      }).success,
    ).toBe(false);
  });

  it('requires callback identity and a stable event type', () => {
    expect(
      mockPaymentCallbackRequestSchema.safeParse({
        providerEventId: 'evt',
        providerTransactionId: 'txn',
      }).success,
    ).toBe(false);
  });
});
