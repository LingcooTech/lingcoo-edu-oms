import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { isoDateTimeSchema } from './common/time.js';

function plainSingleLineText(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[<>]/.test(value), '品牌文本不能包含 HTML 标记')
    .refine((value) => !hasControlCharacter(value), '品牌文本不能包含控制字符');
}

export const brandingAppNameSchema = plainSingleLineText(1, 120);
export const brandingLoginTitleSchema = plainSingleLineText(1, 120);
export const brandingLoginSubtitleSchema = plainSingleLineText(1, 240);
export const brandingColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '主题色必须是 #RRGGBB')
  .transform((value) => value.toLowerCase());
export const brandingFontFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[;{}<>\r\n]/.test(value), '字体名称包含不允许的字符');
export const brandingBorderRadiusSchema = z.number().int().min(0).max(24);

const brandingValuesSchema = z.object({
  appName: brandingAppNameSchema,
  logoAssetId: idSchema.nullable(),
  squareLogoAssetId: idSchema.nullable(),
  darkLogoAssetId: idSchema.nullable(),
  faviconAssetId: idSchema.nullable(),
  primaryColor: brandingColorSchema,
  secondaryColor: brandingColorSchema,
  backgroundColor: brandingColorSchema,
  cardColor: brandingColorSchema,
  textColor: brandingColorSchema,
  headingFont: brandingFontFamilySchema,
  bodyFont: brandingFontFamilySchema,
  borderRadius: brandingBorderRadiusSchema,
  loginTitle: brandingLoginTitleSchema,
  loginSubtitle: brandingLoginSubtitleSchema,
});

export const publicBrandingSchema = brandingValuesSchema
  .omit({
    logoAssetId: true,
    squareLogoAssetId: true,
    darkLogoAssetId: true,
    faviconAssetId: true,
  })
  .extend({
    logoUrl: z.string().startsWith('/api/branding/assets/logo').nullable(),
    squareLogoUrl: z.string().startsWith('/api/branding/assets/square-logo').nullable(),
    darkLogoUrl: z.string().startsWith('/api/branding/assets/dark-logo').nullable(),
    faviconUrl: z.string().startsWith('/api/branding/assets/favicon').nullable(),
    revision: z.number().int().nonnegative(),
  });

export const brandingConfigurationSchema = brandingValuesSchema.extend({
  logoUrl: z.string().startsWith('/api/branding/assets/logo').nullable(),
  squareLogoUrl: z.string().startsWith('/api/branding/assets/square-logo').nullable(),
  darkLogoUrl: z.string().startsWith('/api/branding/assets/dark-logo').nullable(),
  faviconUrl: z.string().startsWith('/api/branding/assets/favicon').nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema.nullable(),
});

export const updateBrandingRequestSchema = brandingValuesSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
});

export type PublicBranding = z.infer<typeof publicBrandingSchema>;
export type BrandingConfiguration = z.infer<typeof brandingConfigurationSchema>;
export type UpdateBrandingRequest = z.infer<typeof updateBrandingRequestSchema>;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
