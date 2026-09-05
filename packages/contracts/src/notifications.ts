import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const notificationLevelSchema = z.enum(['info', 'success', 'warning', 'error']);
export const notificationStatusSchema = z.enum(['unread', 'read', 'archived']);
export const notificationChannelSchema = z.enum(['in_app', 'email']);
export const announcementStatusSchema = z.enum(['draft', 'publishing', 'published', 'withdrawn']);
export const announcementAudienceTypeSchema = z.enum(['all_active_users', 'selected_users']);
export const notificationCategorySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/)
  .max(80);

export const notificationCtaUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      return ['https:', 'mailto:', 'tel:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, '通知链接必须是应用内路径或安全的 https/mailto/tel 链接');

export const notificationSchema = z.object({
  id: idSchema,
  category: notificationCategorySchema,
  level: notificationLevelSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5_000),
  ctaLabel: z.string().min(1).max(80).nullable(),
  ctaUrl: notificationCtaUrlSchema.nullable(),
  sourceType: z.string().min(1).max(120),
  sourceId: z.string().min(1).max(200).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  status: notificationStatusSchema,
  readAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

const booleanQuerySchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);
export const notificationQuerySchema = pageQuerySchema.extend({
  status: notificationStatusSchema.optional(),
  category: notificationCategorySchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  includeArchived: booleanQuerySchema.default(false),
});
export const notificationPageSchema = pagedResponseSchema(notificationSchema);
export const unreadNotificationCountSchema = z.object({ count: z.number().int().nonnegative() });
export const markAllNotificationsReadResultSchema = z.object({
  updatedCount: z.number().int().nonnegative(),
});

export const announcementAudienceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all_active_users') }),
  z.object({
    type: z.literal('selected_users'),
    userIds: z
      .array(idSchema)
      .min(1)
      .max(500)
      .transform((values) => [...new Set(values)]),
  }),
]);
export const announcementChannelsSchema = z
  .array(notificationChannelSchema)
  .min(1)
  .max(2)
  .transform((values) => [...new Set(values)])
  .refine((values) => values.includes('in_app'), '公告必须包含站内通知渠道');

const announcementContentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5_000),
    level: notificationLevelSchema.default('info'),
    ctaLabel: z.string().trim().min(1).max(80).nullable().optional(),
    ctaUrl: notificationCtaUrlSchema.nullable().optional(),
    audience: announcementAudienceSchema,
    channels: announcementChannelsSchema.default(['in_app']),
  })
  .refine((value) => Boolean(value.ctaLabel) === Boolean(value.ctaUrl), {
    message: '操作文案和操作链接必须同时提供',
    path: ['ctaLabel'],
  });

export const createAnnouncementRequestSchema = announcementContentSchema.extend({
  deduplicationKey: z.string().trim().min(8).max(200),
});
export const updateAnnouncementRequestSchema = announcementContentSchema.extend({
  expectedRevision: z.number().int().positive(),
});
export const transitionAnnouncementRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
});

export const announcementSummarySchema = z.object({
  id: idSchema,
  status: announcementStatusSchema,
  audienceType: announcementAudienceTypeSchema,
  channels: z.array(notificationChannelSchema),
  level: notificationLevelSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5_000),
  ctaLabel: z.string().min(1).max(80).nullable(),
  ctaUrl: notificationCtaUrlSchema.nullable(),
  recipientCount: z.number().int().nonnegative(),
  deliveredCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  createdBy: idSchema.nullable(),
  publishedAt: isoDateTimeSchema.nullable(),
  withdrawnAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const announcementDetailSchema = announcementSummarySchema.extend({
  audience: announcementAudienceSchema,
});
export const announcementQuerySchema = pageQuerySchema.extend({
  status: announcementStatusSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export const announcementPageSchema = pagedResponseSchema(announcementSummarySchema);

export type NotificationLevel = z.infer<typeof notificationLevelSchema>;
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationQuery = z.output<typeof notificationQuerySchema>;
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
export type AnnouncementAudience = z.infer<typeof announcementAudienceSchema>;
export type AnnouncementQuery = z.output<typeof announcementQuerySchema>;
export type AnnouncementSummary = z.infer<typeof announcementSummarySchema>;
export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;
export type CreateAnnouncementRequest = z.output<typeof createAnnouncementRequestSchema>;
export type UpdateAnnouncementRequest = z.output<typeof updateAnnouncementRequestSchema>;
export type TransitionAnnouncementRequest = z.infer<typeof transitionAnnouncementRequestSchema>;
