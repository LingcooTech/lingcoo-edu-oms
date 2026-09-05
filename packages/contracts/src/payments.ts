import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';

export const paymentProviderSchema = z.enum(['mock']);
export const paymentIntentStatusSchema = z.enum([
  'created',
  'pending',
  'succeeded',
  'failed',
  'closed',
  'partially_refunded',
  'refunded',
  'unknown',
]);
export const paymentTransactionStatusSchema = z.enum([
  'pending',
  'succeeded',
  'failed',
  'closed',
  'unknown',
]);
export const paymentRefundStatusSchema = z.enum(['pending', 'succeeded', 'failed', 'unknown']);
export const paymentCallbackEventSchema = z.enum([
  'payment.succeeded',
  'payment.failed',
  'payment.closed',
]);

const amountMinorSchema = z.number().int().positive().max(9_000_000_000_000);
const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);
const merchantReferenceSchema = z.string().trim().min(1).max(200);

export const createPaymentIntentRequestSchema = z.object({
  merchantReference: merchantReferenceSchema,
  provider: paymentProviderSchema.default('mock'),
  amountMinor: amountMinorSchema,
  currency: currencySchema.default('CNY'),
  description: z.string().trim().min(1).max(500),
});

export const createPaymentRefundRequestSchema = z.object({
  requestKey: z.string().trim().min(8).max(200),
  amountMinor: amountMinorSchema,
  reason: z.string().trim().min(1).max(500),
});

export const paymentIntentSummarySchema = z.object({
  id: idSchema,
  merchantReference: merchantReferenceSchema,
  provider: paymentProviderSchema,
  amountMinor: amountMinorSchema,
  refundedAmountMinor: z.number().int().nonnegative().max(9_000_000_000_000),
  currency: currencySchema,
  description: z.string().min(1).max(500),
  status: paymentIntentStatusSchema,
  revision: z.number().int().positive(),
  paidAt: isoDateTimeSchema.nullable(),
  closedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const paymentTransactionSchema = z.object({
  id: idSchema,
  intentId: idSchema,
  provider: paymentProviderSchema,
  providerTransactionId: z.string().trim().min(1).max(200),
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  status: paymentTransactionStatusSchema,
  lastQueriedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const paymentRefundSchema = z.object({
  id: idSchema,
  intentId: idSchema,
  requestKey: z.string().trim().min(8).max(200),
  providerRefundId: z.string().trim().min(1).max(200).nullable(),
  amountMinor: amountMinorSchema,
  reason: z.string().trim().min(1).max(500),
  status: paymentRefundStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const paymentCallbackSchema = z.object({
  id: idSchema,
  intentId: idSchema,
  provider: paymentProviderSchema,
  providerEventId: z.string().trim().min(1).max(200),
  providerTransactionId: z.string().trim().min(1).max(200),
  eventType: paymentCallbackEventSchema,
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  receivedAt: isoDateTimeSchema,
  processedAt: isoDateTimeSchema,
});

export const paymentIntentDetailSchema = paymentIntentSummarySchema.extend({
  transactions: z.array(paymentTransactionSchema),
  refunds: z.array(paymentRefundSchema),
});

export const paymentIntentQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  provider: paymentProviderSchema.optional(),
  status: paymentIntentStatusSchema.optional(),
});
export const paymentTransactionQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  status: paymentTransactionStatusSchema.optional(),
});
export const paymentRefundQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  status: paymentRefundStatusSchema.optional(),
});
export const paymentCallbackQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  eventType: paymentCallbackEventSchema.optional(),
});

export const paymentIntentPageSchema = pagedResponseSchema(paymentIntentSummarySchema);
export const paymentTransactionPageSchema = pagedResponseSchema(paymentTransactionSchema);
export const paymentRefundPageSchema = pagedResponseSchema(paymentRefundSchema);
export const paymentCallbackPageSchema = pagedResponseSchema(paymentCallbackSchema);

export const mockPaymentCallbackRequestSchema = z.object({
  providerEventId: z.string().trim().min(1).max(200),
  providerTransactionId: z.string().trim().min(1).max(200),
  appId: z.string().trim().min(1).max(200),
  merchantId: z.string().trim().min(1).max(200),
  eventType: paymentCallbackEventSchema,
  amountMinor: amountMinorSchema,
  currency: currencySchema,
  occurredAt: isoDateTimeSchema,
});

export const paymentCallbackResultSchema = z.object({
  accepted: z.literal(true),
  deduplicated: z.boolean(),
  intentId: idSchema,
  status: paymentIntentStatusSchema,
});

export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export type PaymentIntentStatus = z.infer<typeof paymentIntentStatusSchema>;
export type PaymentTransactionStatus = z.infer<typeof paymentTransactionStatusSchema>;
export type PaymentRefundStatus = z.infer<typeof paymentRefundStatusSchema>;
export type PaymentCallbackEvent = z.infer<typeof paymentCallbackEventSchema>;
export type CreatePaymentIntentRequest = z.input<typeof createPaymentIntentRequestSchema>;
export type CreatePaymentRefundRequest = z.infer<typeof createPaymentRefundRequestSchema>;
export type PaymentIntentSummary = z.infer<typeof paymentIntentSummarySchema>;
export type PaymentIntentDetail = z.infer<typeof paymentIntentDetailSchema>;
export type PaymentTransaction = z.infer<typeof paymentTransactionSchema>;
export type PaymentRefund = z.infer<typeof paymentRefundSchema>;
export type PaymentCallback = z.infer<typeof paymentCallbackSchema>;
export type PaymentIntentQuery = z.output<typeof paymentIntentQuerySchema>;
export type PaymentTransactionQuery = z.output<typeof paymentTransactionQuerySchema>;
export type PaymentRefundQuery = z.output<typeof paymentRefundQuerySchema>;
export type PaymentCallbackQuery = z.output<typeof paymentCallbackQuerySchema>;
export type MockPaymentCallbackRequest = z.infer<typeof mockPaymentCallbackRequestSchema>;
