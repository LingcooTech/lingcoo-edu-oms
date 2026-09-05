import { publicBrandingSchema, updateBrandingRequestSchema } from '@lingcoo-edu-oms/contracts';
import { describe, expect, it } from 'vitest';

describe('branding contracts', () => {
  it('normalizes a constrained theme color and accepts stable Asset IDs', () => {
    const input = updateBrandingRequestSchema.parse({
      expectedRevision: 0,
      appName: 'Lingcoo Admin',
      logoAssetId: 'ef54dd84-ca70-4d17-bf80-ffaca336113c',
      faviconAssetId: null,
      primaryColor: '#16A085',
      loginTitle: '欢迎登录',
      loginSubtitle: '使用管理员账号继续',
    });
    expect(input.primaryColor).toBe('#16a085');
  });

  it('rejects CSS colors, HTML-like text, and control characters', () => {
    expect(
      updateBrandingRequestSchema.safeParse({
        expectedRevision: 0,
        appName: '<script>alert(1)</script>',
        logoAssetId: null,
        faviconAssetId: null,
        primaryColor: 'rgb(1, 2, 3)',
        loginTitle: '登录\n后台',
        loginSubtitle: '继续',
      }).success,
    ).toBe(false);
  });

  it('does not expose Asset IDs from the public response', () => {
    const result = publicBrandingSchema.parse({
      appName: 'Lingcoo Admin',
      primaryColor: '#1677ff',
      loginTitle: '登录管理后台',
      loginSubtitle: '使用部署管理员账号继续',
      logoUrl: '/api/branding/assets/logo?v=abc123',
      faviconUrl: null,
      revision: 2,
      logoAssetId: 'ef54dd84-ca70-4d17-bf80-ffaca336113c',
    });
    expect(result).not.toHaveProperty('logoAssetId');
  });
});
