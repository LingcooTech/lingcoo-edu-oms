import { describe, expect, it } from 'vitest';

import { jobDetailSchema, jobQuerySchema, jobTypeSchema } from '../src/jobs.js';

describe('jobs contracts', () => {
  it('requires stable namespaced job types and valid date ranges', () => {
    expect(jobTypeSchema.parse('notifications.deliver-email')).toBe('notifications.deliver-email');
    expect(() => jobTypeSchema.parse('deliver')).toThrow();
    expect(() =>
      jobQuerySchema.parse({
        from: '2026-09-02T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('strips payload and worker ownership data from diagnostics', () => {
    const detail = {
      id: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      type: 'tests.deliver',
      queue: 'default',
      status: 'queued',
      priority: 0,
      runAt: '2026-09-01T00:00:00.000Z',
      attemptCount: 0,
      maxAttempts: 3,
      recoveryCount: 0,
      manualRetryCount: 0,
      deduplicationPreview: null,
      leaseExpiresAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      completedAt: null,
      canRetry: false,
      canCancel: true,
      payloadHash: 'a'.repeat(64),
      payloadVersion: 1,
      payloadSizeBytes: 32,
      lastError: null,
      attempts: [],
      payload: { secret: true },
      claimToken: 'must-not-leak',
      workerId: 'internal-host',
    };
    const parsed = jobDetailSchema.parse(detail);
    expect(parsed).not.toHaveProperty('payload');
    expect(parsed).not.toHaveProperty('claimToken');
    expect(parsed).not.toHaveProperty('workerId');
  });
});
