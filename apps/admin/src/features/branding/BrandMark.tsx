import { useBranding } from './BrandingProvider';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const branding = useBranding();
  const fallback = initials(branding.appName);
  return branding.logoUrl ? (
    <img
      className={compact ? 'brand-mark brand-mark--compact' : 'brand-mark'}
      src={branding.logoUrl}
      alt={branding.appName}
    />
  ) : (
    <span className={compact ? 'brand-mark brand-mark--compact' : 'brand-mark'}>{fallback}</span>
  );
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1)
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('');
  return [...(words[0] ?? 'FB')].slice(0, 2).join('').toUpperCase();
}
