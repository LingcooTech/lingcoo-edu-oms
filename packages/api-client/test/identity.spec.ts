import { createApiClient } from '../src/client.js';
import { createIdentityApi } from '../src/identity.js';
import { describe, expect, it, vi } from 'vitest';

describe('identity api', () => {
  it('maps an unauthenticated session response to null', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'login required' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );
    const api = createIdentityApi(createApiClient({ fetch }));

    await expect(api.getSession()).resolves.toBeNull();
  });

  it('sends the csrf token on session revocation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const api = createIdentityApi(createApiClient({ fetch, getCsrfToken: () => 'csrf-value' }));

    await api.revokeSession('2a358b25-38e7-4bc7-b33a-25151c06c0a7');

    const request = fetch.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get('x-csrf-token')).toBe('csrf-value');
  });
});
