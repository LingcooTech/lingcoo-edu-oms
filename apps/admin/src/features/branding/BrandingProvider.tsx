import type { PublicBranding } from '@lingcoo-edu-oms/contracts';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { usePublicBranding } from './hooks';

export const FALLBACK_BRANDING: PublicBranding = {
  appName: 'Lingcoo Edu OMS',
  primaryColor: '#3d5afe',
  secondaryColor: '#722ed1',
  backgroundColor: '#f4f6fa',
  cardColor: '#ffffff',
  textColor: '#172033',
  headingFont:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  bodyFont:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  borderRadius: 8,
  loginTitle: '登录 Lingcoo Edu OMS',
  loginSubtitle: '使用你的邮箱或手机号继续',
  logoUrl: null,
  squareLogoUrl: null,
  darkLogoUrl: null,
  faviconUrl: null,
  revision: 0,
};

const BrandingContext = createContext<PublicBranding>(FALLBACK_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const query = usePublicBranding();
  const branding = query.data ?? FALLBACK_BRANDING;

  useEffect(() => {
    document.title = `${branding.appName} 管理后台`;
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', branding.primaryColor);
    root.style.setProperty('--brand-secondary', branding.secondaryColor);
    root.style.setProperty('--brand-background', branding.backgroundColor);
    root.style.setProperty('--brand-card', branding.cardColor);
    root.style.setProperty('--brand-text', branding.textColor);
    root.style.setProperty('--brand-heading-font', branding.headingFont);
    root.style.setProperty('--brand-body-font', branding.bodyFont);
    root.style.setProperty('--brand-radius', `${branding.borderRadius}px`);
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
  }, [branding]);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

export function useBranding(): PublicBranding {
  return useContext(BrandingContext);
}
