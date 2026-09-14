import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { paymentIntentDetailSchema, paymentProviderSchema } from './payments.js';
import {
  createGuardianAndBindRequestSchema,
  createStudentRequestSchema,
  institutionStudentSchema,
} from './people.js';
import { institutionPageSchema } from './organization.js';
import {
  periodCardActivationPolicySchema,
  periodCardDurationUnitSchema,
  periodCardModeSchema,
} from './period-cards.js';

export const lessonOrderStatusSchema = z.enum([
  'awaiting_settlement',
  'pending_payment',
  'paid_pending_grant',
  'completed',
  'closed',
  'grant_failed',
  'refunding',
  'refunded',
]);

export const lessonOrderSourceTypeSchema = z.enum(['normal', 'group_formation']);
export const lessonOrderChannelSchema = z.enum(['pending', 'online', 'offline']);
export const lessonOrderPaymentMethodSchema = z.enum([
  'pending',
  'wechat_pay',
  'mock',
  'cash',
  'bank_transfer',
  'wechat_transfer',
  'other',
]);
export const offlineLessonOrderPaymentMethodSchema = lessonOrderPaymentMethodSchema.extract([
  'cash',
  'bank_transfer',
  'wechat_transfer',
  'other',
]);

export const lessonOrderProductTypeSchema = z.enum(['lesson_package', 'period_card']);

const lessonOrderCommonSchema = z.object({
  id: idSchema,
  orderNo: z.string().trim().min(1).max(64),
  institutionId: idSchema,
  studentId: idSchema,
  studentName: z.string().trim().min(1).max(120),
  guardianId: idSchema,
  guardianName: z.string().trim().min(1).max(120),
  sourceType: lessonOrderSourceTypeSchema,
  sourceReferenceId: idSchema.nullable(),
  channel: lessonOrderChannelSchema,
  listedAmountMinor: z.number().int().nonnegative(),
  amountMinor: z.number().int().positive(),
  depositAppliedMinor: z.number().int().nonnegative(),
  balanceDueMinor: z.number().int().nonnegative(),
  currency: z.literal('CNY'),
  provider: paymentProviderSchema.nullable(),
  paymentMethod: lessonOrderPaymentMethodSchema,
  paymentReference: z.string().trim().min(1).max(160).nullable(),
  paymentNote: z.string().trim().min(1).max(500).nullable(),
  priceAdjustmentReason: z.string().trim().min(1).max(500).nullable(),
  receiptNo: z.string().trim().min(1).max(80),
  paymentIntentId: idSchema.nullable(),
  status: lessonOrderStatusSchema,
  failureCode: z.string().trim().min(1).max(120).nullable(),
  failureMessage: z.string().trim().min(1).max(500).nullable(),
  paidAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  paymentDeadlineAt: isoDateTimeSchema.nullable(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const lessonPackageOrderSchema = lessonOrderCommonSchema.extend({
  productType: z.literal('lesson_package'),
  packageId: idSchema,
  packageVersionId: idSchema,
  packageVersion: z.number().int().positive(),
  packageName: z.string().trim().min(1).max(160),
  baseUnits: z.number().int().positive(),
  bonusUnits: z.number().int().nonnegative(),
  periodCardProductId: z.null(),
  periodCardProductVersionId: z.null(),
  periodCardProductVersion: z.null(),
  periodCardProductName: z.null(),
  periodCardMode: z.null(),
  periodCardUsageLimit: z.null(),
  periodCardDurationUnit: z.null(),
  periodCardDurationCount: z.null(),
  periodCardActivationPolicy: z.null(),
  grantMovementId: idSchema.nullable(),
  periodCardEntitlementId: z.null(),
});

const periodCardOrderSchema = lessonOrderCommonSchema
  .extend({
    productType: z.literal('period_card'),
    packageId: z.null(),
    packageVersionId: z.null(),
    packageVersion: z.null(),
    packageName: z.null(),
    baseUnits: z.null(),
    bonusUnits: z.null(),
    periodCardProductId: idSchema,
    periodCardProductVersionId: idSchema,
    periodCardProductVersion: z.number().int().positive(),
    periodCardProductName: z.string().trim().min(1).max(160),
    periodCardMode: periodCardModeSchema,
    periodCardUsageLimit: z.number().int().positive().nullable(),
    periodCardDurationUnit: periodCardDurationUnitSchema,
    periodCardDurationCount: z.number().int().positive(),
    periodCardActivationPolicy: periodCardActivationPolicySchema,
    grantMovementId: z.null(),
    periodCardEntitlementId: idSchema.nullable(),
  })
  .refine((value) => value.periodCardMode === 'unlimited' || value.periodCardUsageLimit !== null, {
    path: ['periodCardUsageLimit'],
    message: '限次周期卡订单必须包含使用上限',
  });

const lessonOrderResponseSchema = z.discriminatedUnion('productType', [
  lessonPackageOrderSchema,
  periodCardOrderSchema,
]);

/**
 * Existing normal-order responses predate group settlement fields. The response
 * adapter preserves their meaning while group-formation orders always carry the
 * server-calculated settlement values explicitly.
 */
export const lessonOrderSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const order = value as Record<string, unknown>;
  return {
    ...order,
    sourceType: order.sourceType ?? 'normal',
    sourceReferenceId: order.sourceReferenceId ?? null,
    depositAppliedMinor: order.depositAppliedMinor ?? 0,
    balanceDueMinor: order.balanceDueMinor ?? order.amountMinor,
    paymentDeadlineAt: order.paymentDeadlineAt ?? null,
  };
}, lessonOrderResponseSchema);

export const createMiniStudentRequestSchema = z.object({
  institutionId: idSchema,
  guardianName: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(60).default('家长'),
  student: createStudentRequestSchema,
});

export const miniStudentListQuerySchema = pageQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  institutionId: idSchema,
});

const createLessonPackageOrderRequestSchema = z
  .object({
    institutionId: idSchema,
    studentId: idSchema,
    productType: z.literal('lesson_package').optional(),
    packageId: idSchema,
    provider: paymentProviderSchema.default('mock'),
  })
  .transform((value) => ({ ...value, productType: 'lesson_package' as const }));

const createPeriodCardOrderRequestSchema = z.object({
  institutionId: idSchema,
  studentId: idSchema,
  productType: z.literal('period_card'),
  periodCardProductId: idSchema,
  provider: paymentProviderSchema.default('mock'),
});

export const createLessonOrderRequestSchema = z.union([
  createLessonPackageOrderRequestSchema,
  createPeriodCardOrderRequestSchema,
]);

const existingOfflineOrderStudentSchema = z.object({
  kind: z.literal('existing'),
  studentId: idSchema,
  guardianId: idSchema,
});

const newOfflineOrderStudentSchema = z.object({
  kind: z.literal('new'),
  profile: createStudentRequestSchema,
  guardian: createGuardianAndBindRequestSchema,
});

const offlineLessonOrderCommonShape = {
  student: z.discriminatedUnion('kind', [
    existingOfflineOrderStudentSchema,
    newOfflineOrderStudentSchema,
  ]),
  paidAmountMinor: z.number().int().positive(),
  paymentMethod: offlineLessonOrderPaymentMethodSchema,
  receivedAt: isoDateTimeSchema,
  paymentReference: z.string().trim().min(1).max(160).nullable().optional().default(null),
  paymentNote: z.string().trim().min(1).max(500).nullable().optional().default(null),
  priceAdjustmentReason: z.string().trim().min(1).max(500).nullable().optional().default(null),
} as const;

const createOfflineLessonPackageOrderRequestSchema = z
  .object({
    ...offlineLessonOrderCommonShape,
    productType: z.literal('lesson_package').optional(),
    packageId: idSchema,
  })
  .transform((value) => ({ ...value, productType: 'lesson_package' as const }));

const createOfflinePeriodCardOrderRequestSchema = z.object({
  ...offlineLessonOrderCommonShape,
  productType: z.literal('period_card'),
  periodCardProductId: idSchema,
});

export const createOfflineLessonOrderRequestSchema = z.union([
  createOfflineLessonPackageOrderRequestSchema,
  createOfflinePeriodCardOrderRequestSchema,
]);

export const startGroupOrderOnlinePaymentRequestSchema = z.object({
  provider: paymentProviderSchema.optional(),
});

export const recordGroupOrderOfflineSettlementRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  paidAmountMinor: z.number().int().positive(),
  paymentMethod: offlineLessonOrderPaymentMethodSchema,
  paidAt: isoDateTimeSchema.optional(),
  paymentReference: z.string().trim().min(1).max(160).nullable().optional().default(null),
  paymentNote: z.string().trim().min(1).max(500).nullable().optional().default(null),
});

export const lessonOrderListQuerySchema = pageQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(160).optional(),
  productType: lessonOrderProductTypeSchema.optional(),
  status: lessonOrderStatusSchema.optional(),
  studentId: idSchema.optional(),
});

export const lessonOrderPageSchema = pagedResponseSchema(lessonOrderSchema);
export const miniStudentPageSchema = pagedResponseSchema(institutionStudentSchema);
export const miniInstitutionPageSchema = institutionPageSchema;

export const lessonOrderCheckoutSchema = z.object({
  order: lessonOrderSchema,
  payment: paymentIntentDetailSchema,
});

export const retryLessonOrderGrantRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).default('重试订单商品权益自动发放'),
});

export const refundLessonOrderRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(2).max(500),
});

export const lessonReceiptSchema = z.object({
  receiptNo: z.string().trim().min(1).max(80),
  title: z.literal('收据'),
  issuedAt: isoDateTimeSchema,
  settlementMark: z.enum(['现金收讫', '款项已收']),
  amountUppercase: z.string().trim().min(1).max(120),
  organization: z.object({
    name: z.string().trim().min(1).max(160),
    brandName: z.string().trim().min(1).max(160),
    logoUrl: z.string().trim().min(1).max(500).nullable(),
    phone: z.string().trim().min(1).max(40).nullable(),
    address: z.string().trim().min(1).max(255).nullable(),
  }),
  institution: z.object({
    id: idSchema,
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().min(1).max(40).nullable(),
    address: z.string().trim().min(1).max(300).nullable(),
  }),
  order: lessonOrderSchema,
});

export type LessonOrderStatus = z.infer<typeof lessonOrderStatusSchema>;
export type LessonOrderSourceType = z.infer<typeof lessonOrderSourceTypeSchema>;
export type LessonOrderProductType = z.infer<typeof lessonOrderProductTypeSchema>;
export type LessonOrderChannel = z.infer<typeof lessonOrderChannelSchema>;
export type LessonOrderPaymentMethod = z.infer<typeof lessonOrderPaymentMethodSchema>;
export type LessonOrder = z.infer<typeof lessonOrderSchema>;
export type CreateMiniStudentRequest = z.input<typeof createMiniStudentRequestSchema>;
export type MiniStudentListQuery = z.output<typeof miniStudentListQuerySchema>;
export type CreateLessonOrderRequest = z.input<typeof createLessonOrderRequestSchema>;
export type CreateOfflineLessonOrderRequest = z.input<typeof createOfflineLessonOrderRequestSchema>;
export type StartGroupOrderOnlinePaymentRequest = z.input<
  typeof startGroupOrderOnlinePaymentRequestSchema
>;
export type RecordGroupOrderOfflineSettlementRequest = z.input<
  typeof recordGroupOrderOfflineSettlementRequestSchema
>;
export type LessonOrderListQuery = z.output<typeof lessonOrderListQuerySchema>;
export type LessonOrderCheckout = z.infer<typeof lessonOrderCheckoutSchema>;
export type LessonReceipt = z.infer<typeof lessonReceiptSchema>;
export type RetryLessonOrderGrantRequest = z.input<typeof retryLessonOrderGrantRequestSchema>;
export type RefundLessonOrderRequest = z.infer<typeof refundLessonOrderRequestSchema>;
