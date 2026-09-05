import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const auditActorTypeSchema = z.enum(['user', 'system', 'job', 'provider']);
export const auditCategorySchema = z.enum(['security', 'access', 'account', 'system', 'business']);
export const auditOutcomeSchema = z.enum(['success', 'failure']);
export const auditChangeSchema = z.object({
  field: z.string().trim().min(1).max(120),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});

export const auditEventSchema = z.object({
  id: idSchema,
  occurredAt: isoDateTimeSchema,
  eventVersion: z.number().int().positive(),
  redactionVersion: z.number().int().positive(),
  category: auditCategorySchema,
  actorType: auditActorTypeSchema,
  actorId: z.string().trim().min(1).max(200).nullable(),
  actorLabel: z.string().trim().min(1).max(200).nullable(),
  action: z.string().trim().min(1).max(120),
  resourceType: z.string().trim().min(1).max(120),
  resourceId: z.string().trim().min(1).max(200).nullable(),
  outcome: auditOutcomeSchema,
  requestId: z.string().trim().min(1).max(200).nullable(),
  correlationId: z.string().trim().min(1).max(200).nullable(),
  ipAddress: z.string().trim().min(1).max(64).nullable(),
  userAgent: z.string().trim().min(1).max(512).nullable(),
  changes: z.array(auditChangeSchema),
  metadata: z.record(z.string(), z.unknown()),
});

export const auditQuerySchema = pageQuerySchema
  .extend({
    search: z.string().trim().min(1).max(120).optional(),
    actorType: auditActorTypeSchema.optional(),
    category: auditCategorySchema.optional(),
    actorId: z.string().trim().min(1).max(200).optional(),
    action: z.string().trim().min(1).max(120).optional(),
    resourceType: z.string().trim().min(1).max(120).optional(),
    resourceId: z.string().trim().min(1).max(200).optional(),
    outcome: auditOutcomeSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    {
      path: ['to'],
      message: '结束时间不能早于开始时间',
    },
  );

export const auditEventPageSchema = pagedResponseSchema(auditEventSchema);

export type AuditActorType = z.infer<typeof auditActorTypeSchema>;
export type AuditCategory = z.infer<typeof auditCategorySchema>;
export type AuditChange = z.infer<typeof auditChangeSchema>;
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditQuery = z.output<typeof auditQuerySchema>;
