import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerWechatMiniAuthRoutes } from '../src/modules/wechat-mini-program/api/routes.js';
import type { WechatMiniAuthService } from '../src/modules/wechat-mini-program/application/wechat-mini-auth.service.js';

function authService(): WechatMiniAuthService {
  return {
    login: vi.fn(async () => ({
      status: 'binding_required' as const,
      bindToken: 'b'.repeat(43),
      bindExpiresAt: '2026-09-11T01:00:00.000Z',
    })),
    bindPhone: vi.fn(async () => ({
      status: 'authenticated' as const,
      user: {
        id: '8a3eebcb-3a9c-42f1-b9f0-6dc0d5220fb7',
        email: null,
        phone: '+8613812345678',
        mustChangePassword: false,
        displayName: null,
        status: 'active' as const,
        emailVerifiedAt: null,
        createdAt: '2026-09-11T00:00:00.000Z',
      },
      session: {
        id: '57f17ecf-0a7e-4aac-a6b5-364726aebd03',
        expiresAt: '2026-09-18T00:00:00.000Z',
      },
      csrfToken: 'c'.repeat(43),
      accessToken: 's'.repeat(43),
    })),
  } as unknown as WechatMiniAuthService;
}

describe('WeChat mini-program auth routes', () => {
  it('registers both public auth endpoints with independent rate limits', async () => {
    const app = Fastify();
    await app.register(rateLimit, { global: false });
    await registerWechatMiniAuthRoutes(app, authService());

    const login = await app.inject({
      method: 'POST',
      url: '/api/mini/auth/wechat/login',
      payload: { code: 'wechat-login-code' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ status: 'binding_required' });

    const bind = await app.inject({
      method: 'POST',
      url: '/api/mini/auth/wechat/bind-phone',
      payload: { bindToken: 'b'.repeat(43), code: 'wechat-phone-code' },
    });
    expect(bind.statusCode).toBe(200);
    expect(bind.json()).toMatchObject({ status: 'authenticated' });

    for (let index = 0; index < 29; index += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/mini/auth/wechat/login',
        payload: { code: `wechat-login-code-${index}` },
      });
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/mini/auth/wechat/login',
      payload: { code: 'wechat-login-code-limited' },
    });
    expect(limited.statusCode).toBe(429);
    await app.close();
  });
});
