import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const idempotencyScopeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
  .max(120);
export const idempotencyOperationSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
  .max(120);
export const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._~:/-]*$/)
  .max(200);
export const idempotencyStatusSchema = z.enum(['processing', 'succeeded', 'failed', 'stale']);

export const idempotencyRecordSummarySchema = z.object({
  id: idSchema,
  scope: idempotencyScopeSchema,
  operation: idempotencyOperationSchema,
  keyPreview: z.string().trim().min(1).max(32),
  status: idempotencyStatusSchema,
  attemptCount: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  recoveryCount: z.number().int().nonnegative(),
  actorId: idSchema.nullable(),
  lockedUntil: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});

export const idempotencyLastErrorSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500),
  statusCode: z.number().int().min(400).max(599),
  retryable: z.boolean(),
});

export const idempotencyRecordSchema = idempotencyRecordSummarySchema.extend({
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestHashVersion: z.literal(1),
  resultStored: z.boolean(),
  resultSizeBytes: z.number().int().nonnegative().nullable(),
  lastError: idempotencyLastErrorSchema.nullable(),
});

export const idempotencyQuerySchema = pageQuerySchema
  .extend({
    search: z.string().trim().min(1).max(120).optional(),
    status: idempotencyStatusSchema.optional(),
    operation: idempotencyOperationSchema.optional(),
    scope: idempotencyScopeSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { path: ['to'], message: '结束时间不能早于开始时间' },
  );

export const idempotencyRecordPageSchema = pagedResponseSchema(idempotencyRecordSummarySchema);

export type IdempotencyScope = z.infer<typeof idempotencyScopeSchema>;
export type IdempotencyOperation = z.infer<typeof idempotencyOperationSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
export type IdempotencyStatus = z.infer<typeof idempotencyStatusSchema>;
export type IdempotencyRecordSummary = z.infer<typeof idempotencyRecordSummarySchema>;
export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;
export type IdempotencyQuery = z.output<typeof idempotencyQuerySchema>;
