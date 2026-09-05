import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';
import { createIdempotencyApi } from '../src/idempotency.js';

describe('idempotency api', () => {
  it('serializes diagnostic filters and validates the page', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const api = createIdempotencyApi(createApiClient({ fetch }));
    await expect(
      api.list({ status: 'failed', operation: 'orders.create', scope: 'account:owner' }),
    ).resolves.toMatchObject({ total: 0 });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=failed'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
