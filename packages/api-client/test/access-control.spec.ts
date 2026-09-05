import { describe, expect, it, vi } from 'vitest';

import { createAccessControlApi } from '../src/access-control.js';
import { createApiClient } from '../src/client.js';

describe('access control api', () => {
  it('encodes user filters and sends csrf for mutations', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], page: 2, pageSize: 20, total: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const api = createAccessControlApi(
      createApiClient({ fetch, getCsrfToken: () => 'csrf-value' }),
    );

    await api.listUsers({ page: 2, search: '客服@example.com' });
    await api.deleteRole('b758f3b7-d0cc-4fc4-a7bb-bd51c10b43ae');

    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/access/users?page=2&search=%E5%AE%A2%E6%9C%8D%40example.com',
    );
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('x-csrf-token')).toBe('csrf-value');
  });
});
