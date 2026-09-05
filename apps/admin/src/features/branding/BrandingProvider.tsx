import type { PublicBranding } from '@lingcoo-edu-oms/contracts';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { usePublicBranding } from './hooks';

export const FALLBACK_BRANDING: PublicBranding = {
  appName: 'Fastify Business',
  primaryColor: '#1677ff',
  loginTitle: '登录管理后台',
  loginSubtitle: '使用部署管理员账号继续',
  logoUrl: null,
  faviconUrl: null,
  revision: 0,
};

const BrandingContext = createContext<PublicBranding>(FALLBACK_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const query = usePublicBranding();
  const branding = query.data ?? FALLBACK_BRANDING;

  useEffect(() => {
    document.title = `${branding.appName} 管理后台`;
    const existing = document.querySelector<HTMLLinkElement>('link[data-branding-favicon]');
    if (!branding.faviconUrl) {
      existing?.remove();
      return;
    }
    const link = existing ?? document.createElement('link');
    link.rel = 'icon';
    link.dataset.brandingFavicon = 'true';
    link.href = branding.faviconUrl;
    if (!existing) document.head.append(link);
  }, [branding.appName, branding.faviconUrl]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): PublicBranding {
  return useContext(BrandingContext);
}
