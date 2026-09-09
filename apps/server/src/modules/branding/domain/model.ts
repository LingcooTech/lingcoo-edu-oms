export const APPLICATION_BRANDING_REFERENCE = {
  ownerType: 'application-branding',
  ownerId: 'default',
  fields: {
    logo: 'logo',
    squareLogo: 'square-logo',
    darkLogo: 'dark-logo',
    favicon: 'favicon',
  },
} as const;

export const DEFAULT_BRANDING = {
  primaryColor: '#1677ff',
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
  loginSubtitle: '使用邮箱或手机号登录',
} as const;
