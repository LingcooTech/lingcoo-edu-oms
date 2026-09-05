import { createHmac } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { mockPaymentCallbackRequestSchema } from '@lingcoo-edu-oms/contracts';
import { describe, expect, it } from 'vitest';

import type { SettingsReader } from '../src/modules/settings/public.js';
import { MockPaymentProvider } from '../src/modules/payments/public.js';

const secret = 'mock-payment-signing-secret-at-least-32-characters';
const settings: SettingsReader = {
  async getValue(key) {
    return (
      {
        'payments.mock.app-id': 'app-1',
        'payments.mock.merchant-id': 'merchant-1',
        'payments.mock.signing-secret': secret,
      } as Record<string, unknown>
    )[key] as never;
  },
  async publicValues() {
    return {};
  },
};

describe('mock payment provider', () => {
  it('verifies canonical HMAC callbacks', async () => {
    const payload = mockPaymentCallbackRequestSchema.parse({
      providerEventId: 'event-1',
      providerTransactionId: 'txn-1',
      appId: 'app-1',
      merchantId: 'merchant-1',
      eventType: 'payment.succeeded',
      amountMinor: 1000,
      currency: 'CNY',
      occurredAt: '2026-09-02T00:00:00.000Z',
    });
    const signature = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    await expect(
      new MockPaymentProvider(settings).verifyCallback(
        payload,
        signature,
        Buffer.from(JSON.stringify(payload)),
      ),
    ).resolves.toMatchObject({ provider: 'mock', providerEventId: 'event-1' });
  });

  it('rejects invalid signatures without exposing secret details', async () => {
    const provider = new MockPaymentProvider(settings);
    const payload = mockPaymentCallbackRequestSchema.parse({
      providerEventId: 'event-2',
      providerTransactionId: 'txn-2',
      appId: 'app-1',
      merchantId: 'merchant-1',
      eventType: 'payment.failed',
      amountMinor: 1000,
      currency: 'CNY',
      occurredAt: '2026-09-02T00:00:00.000Z',
    });
    await expect(
      provider.verifyCallback(payload, '0'.repeat(64), Buffer.from(JSON.stringify(payload))),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
