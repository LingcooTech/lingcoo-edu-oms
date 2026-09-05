import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';
import { createAuditApi } from '../src/audit.js';

describe('audit api', () => {
  it('serializes filters and validates the response', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const api = createAuditApi(createApiClient({ fetch }));
    await expect(api.list({ category: 'access', actorId: 'user-1' })).resolves.toMatchObject({
      total: 0,
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('category=access'),
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
