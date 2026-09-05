import { z } from 'zod';

import { isoDateTimeSchema } from './common/time.js';

export const settingKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
  .max(120);
export const settingKindSchema = z.enum(['public', 'internal', 'secret']);
export const settingSourceSchema = z.enum(['environment', 'database', 'default', 'unset']);
export const settingControlSchema = z.enum(['text', 'email', 'url', 'number', 'boolean', 'select']);

export const settingOptionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.number()]),
});

const settingViewBaseSchema = z.object({
  key: settingKeySchema,
  group: z.string().trim().min(1).max(80),
  groupLabel: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  control: settingControlSchema,
  options: z.array(settingOptionSchema),
  source: settingSourceSchema,
  configured: z.boolean(),
  readOnly: z.boolean(),
  version: z.number().int().positive().nullable(),
  updatedAt: isoDateTimeSchema.nullable(),
  updatedBy: z.uuid().nullable(),
});

export const settingViewSchema = z.discriminatedUnion('kind', [
  settingViewBaseSchema.extend({
    kind: z.literal('secret'),
    value: z.never().optional(),
  }),
  settingViewBaseSchema.extend({
    kind: z.enum(['public', 'internal']),
    value: z.unknown().optional(),
  }),
]);

export const settingsConnectionTestSchema = z.object({
  key: settingKeySchema,
  group: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  requiredSettings: z.array(settingKeySchema),
});

export const settingsListResponseSchema = z.object({
  items: z.array(settingViewSchema),
  connectionTests: z.array(settingsConnectionTestSchema),
});

export const publicSettingsResponseSchema = z.object({
  values: z.record(settingKeySchema, z.unknown()),
});

export const saveSettingRequestSchema = z.object({
  value: z.unknown(),
  expectedVersion: z.number().int().positive().nullable(),
});
export const clearSettingRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
});

export const settingConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string().trim().min(1).max(500),
  testedAt: isoDateTimeSchema,
});
export const rotateSettingSecretsResponseSchema = z.object({
  rotated: z.number().int().nonnegative(),
});

export type SettingKey = z.infer<typeof settingKeySchema>;
export type SettingKind = z.infer<typeof settingKindSchema>;
export type SettingSource = z.infer<typeof settingSourceSchema>;
export type SettingControl = z.infer<typeof settingControlSchema>;
export type SettingOption = z.infer<typeof settingOptionSchema>;
export type SettingView = z.infer<typeof settingViewSchema>;
export type SettingsConnectionTest = z.infer<typeof settingsConnectionTestSchema>;
export type SaveSettingRequest = z.infer<typeof saveSettingRequestSchema>;
export type ClearSettingRequest = z.infer<typeof clearSettingRequestSchema>;
export type SettingConnectionTestResult = z.infer<typeof settingConnectionTestResultSchema>;
