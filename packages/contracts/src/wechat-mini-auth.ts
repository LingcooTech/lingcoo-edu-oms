import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { isoDateTimeSchema } from './common/time.js';
import { identityUserSchema } from './identity.js';

const wechatCodeSchema = z.string().trim().min(1).max(256);

export const wechatMiniLoginRequestSchema = z.object({ code: wechatCodeSchema });
export const wechatMiniBindPhoneRequestSchema = z.object({
  bindToken: z.string().trim().min(32).max(200),
  code: wechatCodeSchema,
});

export const wechatMiniAuthenticatedSessionSchema = z.object({
  status: z.literal('authenticated'),
  user: identityUserSchema,
  session: z.object({ id: idSchema, expiresAt: isoDateTimeSchema }),
  csrfToken: z.string().min(32),
  accessToken: z.string().min(32),
});

export const wechatMiniBindRequiredSchema = z.object({
  status: z.literal('binding_required'),
  bindToken: z.string().min(32),
  bindExpiresAt: isoDateTimeSchema,
});

export const wechatMiniLoginResponseSchema = z.union([
  wechatMiniAuthenticatedSessionSchema,
  wechatMiniBindRequiredSchema,
]);

export type WechatMiniLoginRequest = z.infer<typeof wechatMiniLoginRequestSchema>;
export type WechatMiniBindPhoneRequest = z.infer<typeof wechatMiniBindPhoneRequestSchema>;
export type WechatMiniAuthenticatedSession = z.infer<typeof wechatMiniAuthenticatedSessionSchema>;
export type WechatMiniBindRequired = z.infer<typeof wechatMiniBindRequiredSchema>;
export type WechatMiniLoginResponse = z.infer<typeof wechatMiniLoginResponseSchema>;
