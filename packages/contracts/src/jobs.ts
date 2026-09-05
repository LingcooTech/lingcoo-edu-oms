import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const jobTypeSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
  .max(120);
export const jobQueueSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(80);
export const jobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'dead', 'cancelled']);
export const jobAttemptStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
]);

export const jobErrorSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  statusCode: z.number().int().min(400).max(599),
  retryable: z.boolean(),
});

export const jobSummarySchema = z.object({
  id: idSchema,
  type: jobTypeSchema,
  queue: jobQueueSchema,
  status: jobStatusSchema,
  priority: z.number().int().min(-100).max(100),
  runAt: isoDateTimeSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  recoveryCount: z.number().int().nonnegative(),
  manualRetryCount: z.number().int().nonnegative(),
  deduplicationPreview: z.string().trim().min(1).max(32).nullable(),
  leaseExpiresAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  canRetry: z.boolean(),
  canCancel: z.boolean(),
});

export const jobAttemptSchema = z.object({
  id: idSchema,
  attemptNumber: z.number().int().positive(),
  status: jobAttemptStatusSchema,
  startedAt: isoDateTimeSchema,
  heartbeatAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  error: jobErrorSchema.nullable(),
});

export const jobDetailSchema = jobSummarySchema.extend({
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  payloadVersion: z.number().int().positive(),
  payloadSizeBytes: z.number().int().nonnegative(),
  lastError: jobErrorSchema.nullable(),
  attempts: z.array(jobAttemptSchema),
});

export const jobQuerySchema = pageQuerySchema
  .extend({
    search: z.string().trim().min(1).max(120).optional(),
    status: jobStatusSchema.optional(),
    type: jobTypeSchema.optional(),
    queue: jobQueueSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { path: ['to'], message: '结束时间不能早于开始时间' },
  );

export const jobPageSchema = pagedResponseSchema(jobSummarySchema);

export type JobType = z.infer<typeof jobTypeSchema>;
export type JobQueue = z.infer<typeof jobQueueSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobAttemptStatus = z.infer<typeof jobAttemptStatusSchema>;
export type JobError = z.infer<typeof jobErrorSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobAttempt = z.infer<typeof jobAttemptSchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type JobQuery = z.output<typeof jobQuerySchema>;
