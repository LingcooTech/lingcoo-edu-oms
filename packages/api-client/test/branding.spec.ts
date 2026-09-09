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
          secondaryColor: '#722ed1',
          backgroundColor: '#f4f6fa',
          cardColor: '#ffffff',
          textColor: '#172033',
          headingFont: 'sans-serif',
          bodyFont: 'sans-serif',
          borderRadius: 8,
          loginTitle: '欢迎登录',
          loginSubtitle: '使用管理员账号继续',
          logoUrl: null,
          squareLogoUrl: null,
          darkLogoUrl: null,
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
      squareLogoAssetId: null,
      darkLogoAssetId: null,
      faviconAssetId: null,
      primaryColor: '#1677ff',
      secondaryColor: '#722ed1',
      backgroundColor: '#f4f6fa',
      cardColor: '#ffffff',
      textColor: '#172033',
      headingFont: 'sans-serif',
      bodyFont: 'sans-serif',
      borderRadius: 8,
      loginTitle: '欢迎登录',
      loginSubtitle: '使用管理员账号继续',
      logoUrl: null,
      squareLogoUrl: null,
      darkLogoUrl: null,
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
      squareLogoAssetId: null,
      darkLogoAssetId: null,
      faviconAssetId: null,
      primaryColor: response.primaryColor,
      secondaryColor: response.secondaryColor,
      backgroundColor: response.backgroundColor,
      cardColor: response.cardColor,
      textColor: response.textColor,
      headingFont: response.headingFont,
      bodyFont: response.bodyFont,
      borderRadius: response.borderRadius,
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
