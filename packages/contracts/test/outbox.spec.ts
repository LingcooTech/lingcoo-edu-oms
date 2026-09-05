import { describe, expect, it } from 'vitest';

import { outboxEventDetailSchema, outboxQuerySchema } from '../src/outbox.js';

describe('outbox contracts', () => {
  it('accepts underscored aggregate types and validates date ranges', () => {
    expect(outboxQuerySchema.parse({ aggregateType: 'payment_intent' })).toMatchObject({ page: 1 });
    expect(() =>
      outboxQuerySchema.parse({ from: '2026-09-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' }),
    ).toThrow();
  });

  it('strips publisher internals and payloads from diagnostics', () => {
    const value = outboxEventDetailSchema.parse({
      id: '2f54dd84-ca70-4d17-bf80-ffaca336113c',
      topic: 'payments.succeeded',
      eventVersion: 1,
      aggregateType: 'payment_intent',
      aggregateId: 'order-1',
      aggregateVersion: 1,
      status: 'published',
      availableAt: '2026-08-31T00:00:00.000Z',
      attemptCount: 1,
      maxAttempts: 10,
      recoveryCount: 0,
      manualReplayCount: 0,
      deduplicationPreview: null,
      leaseExpiresAt: null,
      occurredAt: '2026-08-31T00:00:00.000Z',
      publishedAt: '2026-08-31T00:00:01.000Z',
      createdAt: '2026-08-31T00:00:00.000Z',
      updatedAt: '2026-08-31T00:00:01.000Z',
      canReplay: false,
      payloadHash: 'a'.repeat(64),
      payloadSizeBytes: 42,
      lastError: null,
      attempts: [],
      payload: { secret: true },
      workerId: 'worker',
      claimToken: 'secret',
      deduplicationHash: 'b'.repeat(64),
    });
    expect(value).not.toHaveProperty('payload');
    expect(value).not.toHaveProperty('workerId');
    expect(value).not.toHaveProperty('claimToken');
    expect(value).not.toHaveProperty('deduplicationHash');
  });
});
