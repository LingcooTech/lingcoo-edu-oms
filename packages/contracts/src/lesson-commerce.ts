import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { paymentIntentDetailSchema, paymentProviderSchema } from './payments.js';
import { createStudentRequestSchema, institutionStudentSchema } from './people.js';
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
  amountMinor: z.number().int().positive(),
  currency: z.literal('CNY'),
  provider: paymentProviderSchema,
  paymentIntentId: idSchema.nullable(),
  grantMovementId: idSchema.nullable(),
  status: lessonOrderStatusSchema,
  failureCode: z.string().trim().min(1).max(120).nullable(),
  failureMessage: z.string().trim().min(1).max(500).nullable(),
  paidAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema,
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

export type LessonOrderStatus = z.infer<typeof lessonOrderStatusSchema>;
export type LessonOrder = z.infer<typeof lessonOrderSchema>;
export type CreateMiniStudentRequest = z.input<typeof createMiniStudentRequestSchema>;
export type MiniStudentListQuery = z.output<typeof miniStudentListQuerySchema>;
export type CreateLessonOrderRequest = z.input<typeof createLessonOrderRequestSchema>;
export type LessonOrderListQuery = z.output<typeof lessonOrderListQuerySchema>;
export type LessonOrderCheckout = z.infer<typeof lessonOrderCheckoutSchema>;
export type RetryLessonOrderGrantRequest = z.input<typeof retryLessonOrderGrantRequestSchema>;
