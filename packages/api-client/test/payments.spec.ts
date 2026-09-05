import { createPaymentsApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';

const intent = {
  id: 'ef54dd84-ca70-4d17-bf80-ffaca336113c',
  merchantReference: 'order-1',
  provider: 'mock',
  amountMinor: 1200,
  refundedAmountMinor: 0,
  currency: 'CNY',
  description: 'Order 1',
  status: 'pending',
  revision: 2,
  paidAt: null,
  closedAt: null,
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  transactions: [],
  refunds: [],
};

describe('payments api client', () => {
  it('creates a validated payment intent with CSRF protection', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify(intent), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await createPaymentsApi(createApiClient({ fetch, getCsrfToken: () => 'csrf' })).createIntent({
      merchantReference: 'order-1',
      amountMinor: 1200,
      description: 'Order 1',
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/payments/intents',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"amountMinor":1200'),
      }),
    );
  });

  it('uses the reconciliation action endpoint', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify(intent), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await createPaymentsApi(createApiClient({ fetch, getCsrfToken: () => 'csrf' })).reconcile(
      intent.id,
    );
    expect(fetch).toHaveBeenCalledWith(
      `/api/payments/intents/${intent.id}/actions/reconcile`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
