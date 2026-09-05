import { createBrandingApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';

describe('branding api client', () => {
  it('reads public branding without provider details', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          appName: 'Lingcoo Admin',
          primaryColor: '#1677ff',
          loginTitle: '欢迎登录',
          loginSubtitle: '使用管理员账号继续',
          logoUrl: null,
          faviconUrl: null,
          revision: 0,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await createBrandingApi(createApiClient({ fetch })).getPublic();
    expect(result.appName).toBe('Lingcoo Admin');
    expect(fetch).toHaveBeenCalledWith(
      '/api/branding/public',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('sends a complete revision-guarded update', async () => {
    const response = {
      appName: 'Lingcoo Admin',
      logoAssetId: null,
      faviconAssetId: null,
      primaryColor: '#1677ff',
      loginTitle: '欢迎登录',
      loginSubtitle: '使用管理员账号继续',
      logoUrl: null,
      faviconUrl: null,
      revision: 3,
      updatedAt: '2026-09-02T00:00:00.000Z',
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await createBrandingApi(createApiClient({ fetch, getCsrfToken: () => 'csrf' })).update({
      expectedRevision: 2,
      appName: response.appName,
      logoAssetId: null,
      faviconAssetId: null,
      primaryColor: response.primaryColor,
      loginTitle: response.loginTitle,
      loginSubtitle: response.loginSubtitle,
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/branding',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.any(Headers),
        body: expect.stringContaining('"expectedRevision":2'),
      }),
    );
  });
});
