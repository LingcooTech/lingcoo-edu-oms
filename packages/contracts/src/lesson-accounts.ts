import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { idempotencyKeySchema } from './idempotency.js';
import { lessonUnitsSchema, nonnegativeLessonUnitsSchema } from './lesson-packages.js';

export const lessonGrantSourceSchema = z.enum([
  'offline_purchase',
  'gift',
  'makeup',
  'migration_opening',
  'custom',
]);
export const lessonBatchSourceTypeSchema = z.enum([
  'offline_purchase',
  'gift',
  'makeup',
  'migration_opening',
  'custom',
  'adjustment',
]);
export const lessonAdjustmentDirectionSchema = z.enum(['credit', 'debit']);
export const lessonMovementDirectionSchema = z.enum(['credit', 'debit']);
export const lessonMovementTypeSchema = z.enum([
  'grant',
  'adjustment_credit',
  'adjustment_debit',
  'clawback',
  'grant_reversal',
  'consume',
  'consume_reversal',
]);
export const lessonBatchStatusSchema = z.enum(['available', 'depleted', 'reversed']);

const reasonSchema = z.string().trim().min(1).max(500);
const sourceReferenceSchema = z.string().trim().min(1).max(200).nullable();

/**
 * Account mutations use headers so request bodies remain pure business commands.
 * Revision 0 means the caller expects the student/institution account not to exist yet.
 */
export const lessonAccountMutationHeadersSchema = z.object({
  'idempotency-key': idempotencyKeySchema,
  'x-expected-account-revision': z.coerce.number().int().nonnegative(),
});

export const lessonAccountSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  institutionId: idSchema,
  balanceUnits: nonnegativeLessonUnitsSchema,
  lifetimeCreditedUnits: nonnegativeLessonUnitsSchema,
  lifetimeDebitedUnits: nonnegativeLessonUnitsSchema,
  activeBatchCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const lessonBatchSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  studentId: idSchema,
  institutionId: idSchema,
  originMovementId: idSchema,
  templateId: idSchema.nullable(),
  templateRevision: z.number().int().positive().nullable(),
  templateName: z.string().trim().min(1).max(160).nullable(),
  sourceType: lessonBatchSourceTypeSchema,
  sourceReference: sourceReferenceSchema,
  reason: reasonSchema,
  baseUnits: nonnegativeLessonUnitsSchema,
  bonusUnits: nonnegativeLessonUnitsSchema,
  totalUnits: lessonUnitsSchema,
  consumedUnits: nonnegativeLessonUnitsSchema,
  withdrawnUnits: nonnegativeLessonUnitsSchema,
  remainingUnits: nonnegativeLessonUnitsSchema,
  status: lessonBatchStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const lessonMovementBatchAllocationSchema = z.object({
  batchId: idSchema,
  units: lessonUnitsSchema,
});

export const lessonMovementSchema = z.object({
  id: idSchema,
  accountId: idSchema,
  studentId: idSchema,
  institutionId: idSchema,
  type: lessonMovementTypeSchema,
  direction: lessonMovementDirectionSchema,
  units: lessonUnitsSchema,
  balanceBeforeUnits: nonnegativeLessonUnitsSchema,
  balanceAfterUnits: nonnegativeLessonUnitsSchema,
  reason: reasonSchema,
  sourceReference: sourceReferenceSchema,
  allocations: z.array(lessonMovementBatchAllocationSchema),
  actorId: idSchema.nullable(),
  occurredAt: isoDateTimeSchema,
});

export const lessonBatchListQuerySchema = pageQuerySchema.extend({
  status: lessonBatchStatusSchema.optional(),
  sourceType: lessonBatchSourceTypeSchema.optional(),
});
export const lessonBatchPageSchema = pagedResponseSchema(lessonBatchSchema);

export const lessonMovementListQuerySchema = pageQuerySchema
  .extend({
    type: lessonMovementTypeSchema.optional(),
    direction: lessonMovementDirectionSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { path: ['to'], message: '结束时间不能早于开始时间' },
  );
export const lessonMovementPageSchema = pagedResponseSchema(lessonMovementSchema);

const grantCommonSchema = z.object({
  source: lessonGrantSourceSchema,
  reason: reasonSchema,
  sourceReference: sourceReferenceSchema.optional().default(null),
});

export const grantFromTemplateRequestSchema = grantCommonSchema.extend({
  templateId: idSchema,
  baseUnits: z.never().optional(),
  bonusUnits: z.never().optional(),
});

export const grantCustomUnitsRequestSchema = grantCommonSchema.extend({
  templateId: z.null().optional().default(null),
  baseUnits: lessonUnitsSchema,
  bonusUnits: nonnegativeLessonUnitsSchema.optional().default(0),
});

export const grantLessonUnitsRequestSchema = z.union([
  grantFromTemplateRequestSchema,
  grantCustomUnitsRequestSchema,
]);

export const adjustLessonUnitsRequestSchema = z.object({
  direction: lessonAdjustmentDirectionSchema,
  units: lessonUnitsSchema,
  reason: reasonSchema,
  sourceReference: sourceReferenceSchema.optional().default(null),
});

/** Partially or fully withdraw a specified number of unconsumed units from one batch. */
export const clawbackLessonUnitsRequestSchema = z.object({
  units: lessonUnitsSchema,
  reason: reasonSchema,
});

/** Reverse an untouched grant in full. Partially consumed or previously debited batches must fail. */
export const reverseLessonGrantRequestSchema = z.object({
  reason: reasonSchema,
});

export const lessonAccountMutationResultSchema = z.object({
  account: lessonAccountSchema,
  movement: lessonMovementSchema,
  affectedBatches: z.array(lessonBatchSchema).min(1),
});

export const grantLessonUnitsResultSchema = lessonAccountMutationResultSchema.extend({
  movement: lessonMovementSchema.extend({
    type: z.literal('grant'),
    direction: z.literal('credit'),
  }),
});

export const adjustLessonUnitsResultSchema = lessonAccountMutationResultSchema.extend({
  movement: z.union([
    lessonMovementSchema.extend({
      type: z.literal('adjustment_credit'),
      direction: z.literal('credit'),
    }),
    lessonMovementSchema.extend({
      type: z.literal('adjustment_debit'),
      direction: z.literal('debit'),
    }),
  ]),
});

export const clawbackLessonUnitsResultSchema = lessonAccountMutationResultSchema.extend({
  movement: lessonMovementSchema.extend({
    type: z.literal('clawback'),
    direction: z.literal('debit'),
  }),
});

export const reverseLessonGrantResultSchema = lessonAccountMutationResultSchema.extend({
  movement: lessonMovementSchema.extend({
    type: z.literal('grant_reversal'),
    direction: z.literal('debit'),
  }),
});

export type LessonGrantSource = z.infer<typeof lessonGrantSourceSchema>;
export type LessonBatchSourceType = z.infer<typeof lessonBatchSourceTypeSchema>;
export type LessonAdjustmentDirection = z.infer<typeof lessonAdjustmentDirectionSchema>;
export type LessonMovementDirection = z.infer<typeof lessonMovementDirectionSchema>;
export type LessonMovementType = z.infer<typeof lessonMovementTypeSchema>;
export type LessonBatchStatus = z.infer<typeof lessonBatchStatusSchema>;
export type LessonAccountMutationHeaders = z.output<typeof lessonAccountMutationHeadersSchema>;
export type LessonAccount = z.infer<typeof lessonAccountSchema>;
export type LessonBatch = z.infer<typeof lessonBatchSchema>;
export type LessonBatchListQuery = z.output<typeof lessonBatchListQuerySchema>;
export type LessonMovement = z.infer<typeof lessonMovementSchema>;
export type LessonMovementListQuery = z.output<typeof lessonMovementListQuerySchema>;
export type GrantLessonUnitsRequest = z.input<typeof grantLessonUnitsRequestSchema>;
export type AdjustLessonUnitsRequest = z.input<typeof adjustLessonUnitsRequestSchema>;
export type ClawbackLessonUnitsRequest = z.infer<typeof clawbackLessonUnitsRequestSchema>;
export type ReverseLessonGrantRequest = z.infer<typeof reverseLessonGrantRequestSchema>;
export type LessonAccountMutationResult = z.infer<typeof lessonAccountMutationResultSchema>;
export type GrantLessonUnitsResult = z.infer<typeof grantLessonUnitsResultSchema>;
export type AdjustLessonUnitsResult = z.infer<typeof adjustLessonUnitsResultSchema>;
export type ClawbackLessonUnitsResult = z.infer<typeof clawbackLessonUnitsResultSchema>;
export type ReverseLessonGrantResult = z.infer<typeof reverseLessonGrantResultSchema>;
