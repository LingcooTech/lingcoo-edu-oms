import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const outboxTopicSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
  .max(120);
export const outboxAggregateTypeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/)
  .max(120);
export const outboxStatusSchema = z.enum(['pending', 'publishing', 'published', 'dead']);
export const outboxAttemptStatusSchema = z.enum(['publishing', 'published', 'failed', 'timed_out']);
export const outboxErrorSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  statusCode: z.number().int().min(400).max(599),
  retryable: z.boolean(),
});

export const outboxEventSummarySchema = z.object({
  id: idSchema,
  topic: outboxTopicSchema,
  eventVersion: z.number().int().positive(),
  aggregateType: outboxAggregateTypeSchema.nullable(),
  aggregateId: z.string().trim().min(1).max(200).nullable(),
  aggregateVersion: z.number().int().positive().nullable(),
  status: outboxStatusSchema,
  availableAt: isoDateTimeSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  recoveryCount: z.number().int().nonnegative(),
  manualReplayCount: z.number().int().nonnegative(),
  deduplicationPreview: z.string().trim().min(1).max(32).nullable(),
  leaseExpiresAt: isoDateTimeSchema.nullable(),
  occurredAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  canReplay: z.boolean(),
});

export const outboxAttemptSchema = z.object({
  id: idSchema,
  attemptNumber: z.number().int().positive(),
  status: outboxAttemptStatusSchema,
  startedAt: isoDateTimeSchema,
  heartbeatAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  error: outboxErrorSchema.nullable(),
});

export const outboxEventDetailSchema = outboxEventSummarySchema.extend({
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payloadSizeBytes: z.number().int().nonnegative(),
  lastError: outboxErrorSchema.nullable(),
  attempts: z.array(outboxAttemptSchema),
});

export const outboxQuerySchema = pageQuerySchema
  .extend({
    search: z.string().trim().min(1).max(120).optional(),
    status: outboxStatusSchema.optional(),
    topic: outboxTopicSchema.optional(),
    aggregateType: outboxAggregateTypeSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { path: ['to'], message: '结束时间不能早于开始时间' },
  );

export const outboxEventPageSchema = pagedResponseSchema(outboxEventSummarySchema);

export type OutboxTopic = z.infer<typeof outboxTopicSchema>;
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;
export type OutboxAttemptStatus = z.infer<typeof outboxAttemptStatusSchema>;
export type OutboxError = z.infer<typeof outboxErrorSchema>;
export type OutboxEventSummary = z.infer<typeof outboxEventSummarySchema>;
export type OutboxAttempt = z.infer<typeof outboxAttemptSchema>;
export type OutboxEventDetail = z.infer<typeof outboxEventDetailSchema>;
export type OutboxQuery = z.output<typeof outboxQuerySchema>;
