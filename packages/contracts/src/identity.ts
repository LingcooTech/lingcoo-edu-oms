import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { isoDateTimeSchema } from './common/time.js';

export const emailAddressSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));
export const passwordSchema = z.string().min(12).max(128);
export const identityStatusSchema = z.enum(['active', 'disabled']);

export const identityUserSchema = z.object({
  id: idSchema,
  email: emailAddressSchema,
  displayName: z.string().min(1).max(120).nullable(),
  status: identityStatusSchema,
  emailVerifiedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

export const loginRequestSchema = z.object({
  email: emailAddressSchema,
  password: z.string().min(1).max(128),
});

export const sessionIdentitySchema = z.object({
  user: identityUserSchema,
  session: z.object({ id: idSchema, expiresAt: isoDateTimeSchema }),
  csrfToken: z.string().min(32),
});

export const identitySessionSchema = z.object({
  id: idSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  lastSeenAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  current: z.boolean(),
});

export const identitySessionListSchema = z.object({ items: z.array(identitySessionSchema) });

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export const requestPasswordResetSchema = z.object({ email: emailAddressSchema });
export const confirmPasswordResetSchema = z.object({
  token: z.string().min(32).max(200),
  newPassword: passwordSchema,
});
export const confirmEmailVerificationSchema = z.object({ token: z.string().min(32).max(200) });
export const acceptedActionSchema = z.object({
  accepted: z.literal(true),
  testToken: z.string().optional(),
});

export type IdentityUser = z.infer<typeof identityUserSchema>;
export type SessionIdentity = z.infer<typeof sessionIdentitySchema>;
export type IdentitySession = z.infer<typeof identitySessionSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ConfirmPasswordReset = z.infer<typeof confirmPasswordResetSchema>;
