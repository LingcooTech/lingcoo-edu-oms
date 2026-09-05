import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrandingProvider, useBranding } from './BrandingProvider';
import { usePublicBranding } from './hooks';

vi.mock('./hooks', () => ({ usePublicBranding: vi.fn() }));

const mockedBranding = vi.mocked(usePublicBranding);

function Consumer() {
  const branding = useBranding();
  return <span>{branding.appName}</span>;
}

describe('BrandingProvider', () => {
  afterEach(() => {
    document.querySelector('link[data-branding-favicon]')?.remove();
    vi.clearAllMocks();
  });

  it('maps public branding to context, title, and a controlled favicon link', async () => {
    mockedBranding.mockReturnValue({
      data: {
        appName: 'Lingcoo Console',
        primaryColor: '#16a085',
        loginTitle: '欢迎回来',
        loginSubtitle: '继续登录',
        logoUrl: null,
        faviconUrl: '/api/branding/assets/favicon?v=abc',
        revision: 2,
      },
    } as ReturnType<typeof usePublicBranding>);
    render(
      <BrandingProvider>
        <Consumer />
      </BrandingProvider>,
    );
    expect(screen.getByText('Lingcoo Console')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Lingcoo Console 管理后台'));
    expect(document.querySelector<HTMLLinkElement>('link[data-branding-favicon]')?.href).toContain(
      '/api/branding/assets/favicon?v=abc',
    );
  });

  it('falls back without blocking rendering when the public request fails', () => {
    mockedBranding.mockReturnValue({ data: undefined, isError: true } as ReturnType<
      typeof usePublicBranding
    >);
    render(
      <BrandingProvider>
        <Consumer />
      </BrandingProvider>,
    );
    expect(screen.getByText('Fastify Business')).toBeInTheDocument();
  });
});
