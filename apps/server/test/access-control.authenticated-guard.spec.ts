import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { AppEnvironment } from '../src/config/environment.js';
import { installAccessControlGuard } from '../src/modules/access-control/api/access-control.guard.js';
import type { AccessControlService } from '../src/modules/access-control/public.js';
import type { IdentityService } from '../src/modules/identity/public.js';

const environment = {
  AUTH_COOKIE_NAME: 'session',
  AUTH_CSRF_COOKIE_NAME: 'csrf',
} as AppEnvironment;

describe('authenticated access policy', () => {
  it('requires an OMS bearer session and CSRF token without resolving administrative permissions', async () => {
    const access = {
      permissionsForUser: vi.fn(async () => []),
    } as unknown as AccessControlService;
    const identity = {
      async resolveSession(sessionToken: string, csrfToken: string) {
        if (sessionToken !== 'session-token' || csrfToken !== 'csrf-token') return null;
        return {
          sessionId: 'session-id',
          csrfDigest: 'not-used-by-bearer-test',
          expiresAt: new Date('2026-09-18T00:00:00.000Z'),
          user: {
            id: 'user-id',
            email: null,
            phone: '+8613812345678',
            mustChangePassword: false,
            displayName: null,
            status: 'active' as const,
            emailVerifiedAt: null,
            createdAt: new Date('2026-09-11T00:00:00.000Z'),
          },
        };
      },
      csrfMatches: vi.fn(() => true),
    } as unknown as IdentityService;
    const app = Fastify();
    await app.register(cookie);
    installAccessControlGuard(app, { environment, identity, access });
    app.post(
      '/api/mini/example',
      { config: { access: { authenticated: true } } },
      async (request) => ({ userId: request.identityPrincipal!.user.id }),
    );

    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/mini/example',
      headers: { authorization: 'Bearer session-token' },
    });
    expect(missingCsrf.statusCode).toBe(401);

    const permitted = await app.inject({
      method: 'POST',
      url: '/api/mini/example',
      headers: {
        authorization: 'Bearer session-token',
        'x-csrf-token': 'csrf-token',
      },
    });
    expect(permitted.statusCode).toBe(200);
    expect(permitted.json()).toEqual({ userId: 'user-id' });
    expect(access.permissionsForUser).not.toHaveBeenCalled();
    await app.close();
  });
});
