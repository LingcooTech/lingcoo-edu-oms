import { describe, expect, it } from 'vitest';

import {
  idempotencyKeySchema,
  idempotencyQuerySchema,
  idempotencyRecordSchema,
} from '../src/idempotency.js';

describe('idempotency contracts', () => {
  it('accepts opaque safe keys and rejects whitespace or header injection', () => {
    expect(idempotencyKeySchema.parse('checkout:order_123/attempt-1')).toBe(
      'checkout:order_123/attempt-1',
    );
    expect(() => idempotencyKeySchema.parse('contains spaces')).toThrow();
    expect(() => idempotencyKeySchema.parse('key\r\ninjected')).toThrow();
  });

  it('validates query time ranges', () => {
    expect(() =>
      idempotencyQuerySchema.parse({
        from: '2026-09-02T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('never includes a stored result payload in diagnostics', () => {
    const record = {
      id: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      scope: 'account:owner',
      operation: 'test.create-order',
      keyPreview: 'request-1',
      status: 'succeeded',
      attemptCount: 1,
      maxAttempts: 3,
      recoveryCount: 0,
      actorId: null,
      lockedUntil: null,
      expiresAt: '2026-09-08T00:00:00.000Z',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:01.000Z',
      completedAt: '2026-09-01T00:00:01.000Z',
      requestHash: 'a'.repeat(64),
      requestHashVersion: 1,
      resultStored: true,
      resultSizeBytes: 32,
      lastError: null,
    };
    expect(idempotencyRecordSchema.parse(record)).toEqual(record);
    expect(() =>
      idempotencyRecordSchema.parse({ ...record, result: { secret: true } }),
    ).not.toThrow();
    expect('result' in idempotencyRecordSchema.parse({ ...record, result: { secret: true } })).toBe(
      false,
    );
  });
});
