import { createApiClient } from '../src/client.js';
import { createIdentityApi } from '../src/identity.js';
import { describe, expect, it, vi } from 'vitest';

describe('identity api', () => {
  it('returns the opaque session token for a native client login', async () => {
    const now = '2026-09-08T00:00:00.000Z';
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'teacher@example.com',
            phone: null,
            mustChangePassword: false,
            displayName: '教师',
            status: 'active',
            emailVerifiedAt: null,
            createdAt: now,
          },
          session: {
            id: '22222222-2222-4222-8222-222222222222',
            expiresAt: '2026-09-09T00:00:00.000Z',
          },
          csrfToken: 'c'.repeat(32),
          accessToken: 's'.repeat(48),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const api = createIdentityApi(createApiClient({ fetch }));

    const result = await api.nativeLogin({
      identifier: 'teacher@example.com',
      password: 'teacher-password',
    });

    expect(result.accessToken).toBe('s'.repeat(48));
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/auth/native/login');
    expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST');
  });

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
