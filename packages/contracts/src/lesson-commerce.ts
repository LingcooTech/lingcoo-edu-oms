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

export const lessonOrderStatusSchema = z.enum([
  'pending_payment',
  'paid_pending_grant',
  'completed',
  'closed',
  'grant_failed',
  'refunding',
  'refunded',
]);

export const lessonOrderChannelSchema = z.enum(['online', 'offline']);
export const lessonOrderPaymentMethodSchema = z.enum([
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

export const lessonOrderSchema = z.object({
  id: idSchema,
  orderNo: z.string().trim().min(1).max(64),
  institutionId: idSchema,
  studentId: idSchema,
  studentName: z.string().trim().min(1).max(120),
  guardianId: idSchema,
  guardianName: z.string().trim().min(1).max(120),
  packageId: idSchema,
  packageVersionId: idSchema,
  packageVersion: z.number().int().positive(),
  packageName: z.string().trim().min(1).max(160),
  baseUnits: z.number().int().positive(),
  bonusUnits: z.number().int().nonnegative(),
  channel: lessonOrderChannelSchema,
  listedAmountMinor: z.number().int().nonnegative(),
  amountMinor: z.number().int().positive(),
  currency: z.literal('CNY'),
  provider: paymentProviderSchema.nullable(),
  paymentMethod: lessonOrderPaymentMethodSchema,
  paymentReference: z.string().trim().min(1).max(160).nullable(),
  paymentNote: z.string().trim().min(1).max(500).nullable(),
  priceAdjustmentReason: z.string().trim().min(1).max(500).nullable(),
  receiptNo: z.string().trim().min(1).max(80),
  paymentIntentId: idSchema.nullable(),
  grantMovementId: idSchema.nullable(),
  status: lessonOrderStatusSchema,
  failureCode: z.string().trim().min(1).max(120).nullable(),
  failureMessage: z.string().trim().min(1).max(500).nullable(),
  paidAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

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

export const createLessonOrderRequestSchema = z.object({
  institutionId: idSchema,
  studentId: idSchema,
  packageId: idSchema,
  provider: paymentProviderSchema.default('mock'),
});

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

export const createOfflineLessonOrderRequestSchema = z.object({
  student: z.discriminatedUnion('kind', [
    existingOfflineOrderStudentSchema,
    newOfflineOrderStudentSchema,
  ]),
  packageId: idSchema,
  paidAmountMinor: z.number().int().positive(),
  paymentMethod: offlineLessonOrderPaymentMethodSchema,
  receivedAt: isoDateTimeSchema,
  paymentReference: z.string().trim().min(1).max(160).nullable().optional().default(null),
  paymentNote: z.string().trim().min(1).max(500).nullable().optional().default(null),
  priceAdjustmentReason: z.string().trim().min(1).max(500).nullable().optional().default(null),
});

export const lessonOrderListQuerySchema = pageQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(160).optional(),
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
  reason: z.string().trim().min(1).max(500).default('重试线上购课自动发放'),
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
export type LessonOrderChannel = z.infer<typeof lessonOrderChannelSchema>;
export type LessonOrderPaymentMethod = z.infer<typeof lessonOrderPaymentMethodSchema>;
export type LessonOrder = z.infer<typeof lessonOrderSchema>;
export type CreateMiniStudentRequest = z.input<typeof createMiniStudentRequestSchema>;
export type MiniStudentListQuery = z.output<typeof miniStudentListQuerySchema>;
export type CreateLessonOrderRequest = z.input<typeof createLessonOrderRequestSchema>;
export type CreateOfflineLessonOrderRequest = z.input<typeof createOfflineLessonOrderRequestSchema>;
export type LessonOrderListQuery = z.output<typeof lessonOrderListQuerySchema>;
export type LessonOrderCheckout = z.infer<typeof lessonOrderCheckoutSchema>;
export type LessonReceipt = z.infer<typeof lessonReceiptSchema>;
export type RetryLessonOrderGrantRequest = z.input<typeof retryLessonOrderGrantRequestSchema>;
