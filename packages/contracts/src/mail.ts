import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { emailAddressSchema } from './identity.js';

export const mailTemplateKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
  .max(120);
export const mailDeliveryStatusSchema = z.enum(['queued', 'sending', 'sent', 'exhausted']);
export const mailTemplateContentSchema = z.string().min(1).max(20_000);

export const mailDeliverySummarySchema = z.object({
  id: idSchema,
  jobId: idSchema.nullable(),
  templateKey: mailTemplateKeySchema,
  templateVersion: z.number().int().positive(),
  templateRevision: z.number().int().positive().nullable(),
  recipientPreview: z.string().min(1).max(320),
  status: mailDeliveryStatusSchema,
  transport: z.enum(['capture', 'smtp']).nullable(),
  attemptCount: z.number().int().nonnegative(),
  simulated: z.boolean(),
  sentAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const mailDeliveryErrorSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  statusCode: z.number().int().min(400).max(599),
  retryable: z.boolean(),
});

export const mailDeliveryDetailSchema = mailDeliverySummarySchema.extend({
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  providerMessageId: z.string().max(500).nullable(),
  lastError: mailDeliveryErrorSchema.nullable(),
});

export const mailDeliveryQuerySchema = pageQuerySchema
  .extend({
    search: z.string().trim().min(1).max(120).optional(),
    status: mailDeliveryStatusSchema.optional(),
    templateKey: mailTemplateKeySchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { path: ['to'], message: '结束时间不能早于开始时间' },
  );
export const mailDeliveryPageSchema = pagedResponseSchema(mailDeliverySummarySchema);

export const mailTemplateSchema = z.object({
  key: mailTemplateKeySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500),
  version: z.number().int().positive(),
  revision: z.number().int().positive().nullable(),
  variables: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)),
  subjectTemplate: mailTemplateContentSchema.max(500),
  textTemplate: mailTemplateContentSchema,
  overridden: z.boolean(),
  updatedAt: isoDateTimeSchema.nullable(),
  updatedBy: idSchema.nullable(),
});
export const mailTemplateListSchema = z.object({ items: z.array(mailTemplateSchema) });
export const updateMailTemplateRequestSchema = z.object({
  expectedRevision: z.number().int().positive().nullable(),
  subjectTemplate: mailTemplateContentSchema.max(500),
  textTemplate: mailTemplateContentSchema,
});
export const resetMailTemplateRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
});
export const sendTestMailRequestSchema = z.object({ to: emailAddressSchema });
export const queuedMailSchema = z.object({ id: idSchema, deduplicated: z.boolean() });

export type MailDeliveryStatus = z.infer<typeof mailDeliveryStatusSchema>;
export type MailDeliverySummary = z.infer<typeof mailDeliverySummarySchema>;
export type MailDeliveryDetail = z.infer<typeof mailDeliveryDetailSchema>;
export type MailDeliveryQuery = z.output<typeof mailDeliveryQuerySchema>;
export type MailTemplate = z.infer<typeof mailTemplateSchema>;
export type UpdateMailTemplateRequest = z.infer<typeof updateMailTemplateRequestSchema>;
export type ResetMailTemplateRequest = z.infer<typeof resetMailTemplateRequestSchema>;
export type SendTestMailRequest = z.infer<typeof sendTestMailRequestSchema>;
