import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const periodCardModeSchema = z.enum(['limited', 'unlimited']);
export const periodCardDurationUnitSchema = z.enum(['day', 'week', 'month']);
export const periodCardActivationPolicySchema = z.enum(['immediate', 'on_first_use']);
export const periodCardProductStatusSchema = z.enum(['active', 'inactive']);
export const periodCardEntitlementLifecycleStateSchema = z.enum(['active', 'revoked']);
export const periodCardEntitlementStatusSchema = z.enum([
  'pending_activation',
  'active',
  'exhausted',
  'expired',
  'revoked',
]);
export const periodCardUsageStatusSchema = z.enum(['active', 'reversed']);

const nullableDescriptionSchema = z.string().trim().min(1).max(2_000).nullable();
const nullableReasonSchema = z.string().trim().min(1).max(500).nullable();
const nullableSaleDateTimeSchema = isoDateTimeSchema.nullable();
const usageLimitSchema = z.number().int().positive().nullable();
const priceAmountSchema = z.number().int().nonnegative();

function hasValidModeLimit(value: { mode?: 'limited' | 'unlimited'; usageLimit?: number | null }) {
  if (value.mode === 'limited') return value.usageLimit !== null && value.usageLimit !== undefined;
  if (value.mode === 'unlimited')
    return value.usageLimit === null || value.usageLimit === undefined;
  return true;
}

function hasChronologicalSaleWindow(value: {
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
}) {
  return (
    !value.saleStartsAt ||
    !value.saleEndsAt ||
    new Date(value.saleStartsAt).getTime() < new Date(value.saleEndsAt).getTime()
  );
}

export const periodCardProductSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  name: z.string().trim().min(1).max(160),
  description: nullableDescriptionSchema,
  mode: periodCardModeSchema,
  usageLimit: usageLimitSchema,
  durationUnit: periodCardDurationUnitSchema,
  durationCount: z.number().int().positive(),
  activationPolicy: periodCardActivationPolicySchema,
  priceAmount: priceAmountSchema,
  currency: z.literal('CNY'),
  onlineSaleEnabled: z.boolean(),
  saleStartsAt: nullableSaleDateTimeSchema,
  saleEndsAt: nullableSaleDateTimeSchema,
  status: periodCardProductStatusSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const periodCardProductListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(160).optional(),
  status: periodCardProductStatusSchema.optional(),
  mode: periodCardModeSchema.optional(),
});
export const periodCardProductPageSchema = pagedResponseSchema(periodCardProductSchema);

export const createPeriodCardProductRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: nullableDescriptionSchema.optional().default(null),
    mode: periodCardModeSchema,
    usageLimit: usageLimitSchema.optional().default(null),
    durationUnit: periodCardDurationUnitSchema,
    durationCount: z.number().int().positive(),
    activationPolicy: periodCardActivationPolicySchema,
    priceAmount: priceAmountSchema.optional().default(0),
    currency: z.literal('CNY').optional().default('CNY'),
    onlineSaleEnabled: z.boolean().optional().default(false),
    saleStartsAt: nullableSaleDateTimeSchema.optional().default(null),
    saleEndsAt: nullableSaleDateTimeSchema.optional().default(null),
  })
  .refine(hasValidModeLimit, {
    path: ['usageLimit'],
    message: '限次周期卡必须填写使用上限，不限次周期卡不能填写使用上限',
  })
  .refine(hasChronologicalSaleWindow, {
    path: ['saleEndsAt'],
    message: '线上销售结束时间必须晚于开始时间',
  });

export const updatePeriodCardProductRequestSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    description: nullableDescriptionSchema.optional(),
    mode: periodCardModeSchema.optional(),
    usageLimit: usageLimitSchema.optional(),
    durationUnit: periodCardDurationUnitSchema.optional(),
    durationCount: z.number().int().positive().optional(),
    activationPolicy: periodCardActivationPolicySchema.optional(),
    priceAmount: priceAmountSchema.optional(),
    onlineSaleEnabled: z.boolean().optional(),
    saleStartsAt: nullableSaleDateTimeSchema.optional(),
    saleEndsAt: nullableSaleDateTimeSchema.optional(),
    status: periodCardProductStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  })
  .refine(hasValidModeLimit, {
    path: ['usageLimit'],
    message: '限次周期卡必须填写使用上限，不限次周期卡不能填写使用上限',
  })
  .refine(hasChronologicalSaleWindow, {
    path: ['saleEndsAt'],
    message: '线上销售结束时间必须晚于开始时间',
  });

export const periodCardEntitlementSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  studentId: idSchema,
  studentName: z.string().trim().min(1).max(160),
  productId: idSchema,
  productVersionId: idSchema,
  productVersion: z.number().int().positive(),
  productName: z.string().trim().min(1).max(160),
  mode: periodCardModeSchema,
  usageLimit: usageLimitSchema,
  usedQuantity: z.number().int().nonnegative(),
  remainingQuantity: z.number().int().nonnegative().nullable(),
  durationUnit: periodCardDurationUnitSchema,
  durationCount: z.number().int().positive(),
  activationPolicy: periodCardActivationPolicySchema,
  activationStartsAt: isoDateTimeSchema.nullable(),
  endsAt: isoDateTimeSchema.nullable(),
  issuedAt: isoDateTimeSchema,
  lifecycleState: periodCardEntitlementLifecycleStateSchema,
  effectiveStatus: periodCardEntitlementStatusSchema,
  sourceType: z.enum(['manual', 'order']),
  sourceReference: z.string().trim().min(1).max(200).nullable(),
  issuedReason: nullableReasonSchema,
  revokedAt: isoDateTimeSchema.nullable(),
  revokedBy: idSchema.nullable(),
  revocationReason: nullableReasonSchema,
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const periodCardEntitlementListQuerySchema = pageQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(160).optional(),
  studentId: idSchema.optional(),
  productId: idSchema.optional(),
  status: periodCardEntitlementStatusSchema.optional(),
});
export const periodCardEntitlementPageSchema = pagedResponseSchema(periodCardEntitlementSchema);

export const issuePeriodCardEntitlementRequestSchema = z.object({
  operationId: z.uuid(),
  studentId: idSchema,
  productId: idSchema,
  activationStartsAt: isoDateTimeSchema.nullable().optional().default(null),
  reason: nullableReasonSchema.optional().default(null),
});

export const revokePeriodCardEntitlementRequestSchema = z.object({
  operationId: z.uuid(),
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});

export const periodCardUsageSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  entitlementId: idSchema,
  studentId: idSchema,
  studentName: z.string().trim().min(1).max(160),
  productName: z.string().trim().min(1).max(160),
  sourceReference: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive(),
  status: periodCardUsageStatusSchema,
  occurredAt: isoDateTimeSchema,
  reason: nullableReasonSchema,
  operationId: z.uuid(),
  createdBy: idSchema,
  reversedAt: isoDateTimeSchema.nullable(),
  reversedBy: idSchema.nullable(),
  reversalOperationId: z.uuid().nullable(),
  reversalReason: nullableReasonSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const periodCardUsageListQuerySchema = pageQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  studentId: idSchema.optional(),
  entitlementId: idSchema.optional(),
  status: periodCardUsageStatusSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export const periodCardUsagePageSchema = pagedResponseSchema(periodCardUsageSchema);

export const usePeriodCardRequestSchema = z.object({
  operationId: z.uuid(),
  entitlementId: idSchema,
  quantity: z.number().int().positive(),
  sourceReference: z.string().trim().min(1).max(240),
  occurredAt: isoDateTimeSchema,
  reason: nullableReasonSchema.optional().default(null),
});

export const reversePeriodCardUsageRequestSchema = z.object({
  operationId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const periodCardMutationResultSchema = z.object({
  entitlement: periodCardEntitlementSchema,
  usage: periodCardUsageSchema,
});

export type PeriodCardMode = z.infer<typeof periodCardModeSchema>;
export type PeriodCardDurationUnit = z.infer<typeof periodCardDurationUnitSchema>;
export type PeriodCardActivationPolicy = z.infer<typeof periodCardActivationPolicySchema>;
export type PeriodCardProduct = z.infer<typeof periodCardProductSchema>;
export type PeriodCardProductListQuery = z.output<typeof periodCardProductListQuerySchema>;
export type CreatePeriodCardProductRequest = z.input<typeof createPeriodCardProductRequestSchema>;
export type UpdatePeriodCardProductRequest = z.infer<typeof updatePeriodCardProductRequestSchema>;
export type PeriodCardEntitlement = z.infer<typeof periodCardEntitlementSchema>;
export type PeriodCardEntitlementListQuery = z.output<typeof periodCardEntitlementListQuerySchema>;
export type IssuePeriodCardEntitlementRequest = z.input<
  typeof issuePeriodCardEntitlementRequestSchema
>;
export type RevokePeriodCardEntitlementRequest = z.infer<
  typeof revokePeriodCardEntitlementRequestSchema
>;
export type PeriodCardUsage = z.infer<typeof periodCardUsageSchema>;
export type PeriodCardUsageListQuery = z.output<typeof periodCardUsageListQuerySchema>;
export type UsePeriodCardRequest = z.input<typeof usePeriodCardRequestSchema>;
export type ReversePeriodCardUsageRequest = z.infer<typeof reversePeriodCardUsageRequestSchema>;
export type PeriodCardMutationResult = z.infer<typeof periodCardMutationResultSchema>;
