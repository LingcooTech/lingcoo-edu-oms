import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';
import { createJobsApi } from '../src/jobs.js';

describe('jobs api', () => {
  it('serializes filters and uses explicit action endpoints', async () => {
    const detail = {
      id: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      type: 'tests.deliver',
      queue: 'default',
      status: 'dead',
      priority: 0,
      runAt: '2026-09-01T00:00:00.000Z',
      attemptCount: 3,
      maxAttempts: 3,
      recoveryCount: 0,
      manualRetryCount: 0,
      deduplicationPreview: null,
      leaseExpiresAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-09-01T00:00:00.000Z',
      canRetry: true,
      canCancel: false,
      payloadHash: 'a'.repeat(64),
      payloadVersion: 1,
      payloadSizeBytes: 10,
      lastError: null,
      attempts: [],
    };
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = String(url);
      const body = path.includes('/actions/')
        ? detail
        : { items: [], page: 1, pageSize: 20, total: 0 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const api = createJobsApi(createApiClient({ fetch }));
    await api.list({ status: 'dead', queue: 'default' });
    await api.retry(detail.id);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=dead'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/actions/retry'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
