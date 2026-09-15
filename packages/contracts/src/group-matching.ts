import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { idempotencyKeySchema } from './idempotency.js';

export const groupMatchingCampaignStatusSchema = z.enum([
  'draft',
  'recruiting',
  'ready',
  'formed',
  'cancelled',
]);

export const groupMatchingEnrollmentStatusSchema = z.enum([
  'pending_deposit',
  'deposit_paid',
  'deposit_refunded',
  'selected',
  'waitlisted',
  'withdrawn',
]);

export const groupMatchingDepositPaymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'wechat_transfer',
  'other',
]);

export const groupMatchingFormationMemberStatusSchema = z.enum([
  'awaiting_order',
  'awaiting_balance',
  'completed',
  'closed',
]);

const positiveIntegerSchema = z.number().int().positive();
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const participantCountSchema = z.number().int().min(2);
const positiveAmountSchema = z.number().int().positive();
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const revisionSchema = positiveIntegerSchema;

export const groupMatchingPriceTierSchema = z
  .object({
    id: idSchema,
    campaignId: idSchema,
    minParticipants: participantCountSchema,
    maxParticipants: participantCountSchema,
    unitPriceMinor: positiveAmountSchema,
    currency: z.literal('CNY'),
    description: nullableText(300),
    createdAt: isoDateTimeSchema,
  })
  .refine((value) => value.minParticipants <= value.maxParticipants, {
    path: ['maxParticipants'],
    message: '价格档位的最大人数不能小于最小人数',
  });

const groupMatchingPriceTierInputSchema = z
  .object({
    minParticipants: participantCountSchema,
    maxParticipants: participantCountSchema,
    unitPriceMinor: positiveAmountSchema,
    description: nullableText(300).optional().default(null),
  })
  .refine((value) => value.minParticipants <= value.maxParticipants, {
    path: ['maxParticipants'],
    message: '价格档位的最大人数不能小于最小人数',
  });

function hasOrderedPriceTiers(tiers: Array<{ minParticipants: number; maxParticipants: number }>) {
  return tiers.every(
    (tier, index) => index === 0 || tier.minParticipants === tiers[index - 1]!.maxParticipants + 1,
  );
}

const priceTiersSchema = z
  .array(groupMatchingPriceTierInputSchema)
  .min(1)
  .max(20)
  .refine(hasOrderedPriceTiers, '价格档位必须按人数连续排列，不能重叠或留空');

function hasCampaignPriceCoverage(value: {
  minParticipants: number;
  maxParticipants: number;
  priceTiers: Array<{ minParticipants: number; maxParticipants: number }>;
}) {
  const first = value.priceTiers[0];
  const last = value.priceTiers[value.priceTiers.length - 1];
  return (
    first?.minParticipants === value.minParticipants &&
    last?.maxParticipants === value.maxParticipants
  );
}

const campaignEditableFields = {
  title: requiredText(160),
  description: nullableText(2_000),
  courseId: idSchema,
  campusId: idSchema,
  minParticipants: participantCountSchema,
  maxParticipants: participantCountSchema,
  depositAmountMinor: nonnegativeIntegerSchema,
  plannedSessionCount: z.number().int().min(2),
  unitsPerSession: positiveIntegerSchema,
  durationMinutes: positiveIntegerSchema,
  candidateSchedule: nullableText(1_000),
  recruitmentDeadlineAt: isoDateTimeSchema,
  balanceDueAt: isoDateTimeSchema.nullable(),
  withdrawalPolicy: nullableText(1_000),
  notes: nullableText(2_000),
};

export const groupMatchingCampaignSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  title: requiredText(160),
  description: nullableText(2_000),
  courseId: idSchema,
  courseNameSnapshot: requiredText(160),
  campusId: idSchema,
  campusNameSnapshot: requiredText(160),
  minParticipants: participantCountSchema,
  maxParticipants: participantCountSchema,
  depositAmountMinor: nonnegativeIntegerSchema,
  plannedSessionCount: z.number().int().min(2),
  unitsPerSession: positiveIntegerSchema,
  durationMinutes: positiveIntegerSchema,
  candidateSchedule: nullableText(1_000),
  recruitmentDeadlineAt: isoDateTimeSchema,
  balanceDueAt: isoDateTimeSchema.nullable(),
  withdrawalPolicy: nullableText(1_000),
  status: groupMatchingCampaignStatusSchema,
  notes: nullableText(2_000),
  createdByUserId: idSchema,
  publishedAt: isoDateTimeSchema.nullable(),
  formedAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  cancellationReason: nullableText(500),
  enrollmentCount: nonnegativeIntegerSchema,
  depositPaidCount: nonnegativeIntegerSchema,
  selectedCount: nonnegativeIntegerSchema,
  waitlistedCount: nonnegativeIntegerSchema,
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  priceTiers: z.array(groupMatchingPriceTierSchema),
});

export const groupMatchingCampaignListQuerySchema = pageQuerySchema.extend({
  status: groupMatchingCampaignStatusSchema.optional(),
});

export const groupMatchingCampaignPageSchema = pagedResponseSchema(groupMatchingCampaignSchema);

export const createGroupMatchingCampaignRequestSchema = z
  .object({
    ...campaignEditableFields,
    description: campaignEditableFields.description.optional().default(null),
    depositAmountMinor: campaignEditableFields.depositAmountMinor.optional().default(0),
    candidateSchedule: campaignEditableFields.candidateSchedule.optional().default(null),
    balanceDueAt: campaignEditableFields.balanceDueAt.optional().default(null),
    withdrawalPolicy: campaignEditableFields.withdrawalPolicy.optional().default(null),
    notes: campaignEditableFields.notes.optional().default(null),
    priceTiers: priceTiersSchema,
  })
  .refine((value) => value.minParticipants <= value.maxParticipants, {
    path: ['maxParticipants'],
    message: '最大人数不能小于最小人数',
  })
  .refine(hasCampaignPriceCoverage, {
    path: ['priceTiers'],
    message: '价格档位必须覆盖拼课的最小至最大人数范围',
  });

const updateableCampaignFields = {
  title: campaignEditableFields.title.optional(),
  description: campaignEditableFields.description.optional(),
  courseId: campaignEditableFields.courseId.optional(),
  campusId: campaignEditableFields.campusId.optional(),
  minParticipants: campaignEditableFields.minParticipants.optional(),
  maxParticipants: campaignEditableFields.maxParticipants.optional(),
  depositAmountMinor: campaignEditableFields.depositAmountMinor.optional(),
  plannedSessionCount: campaignEditableFields.plannedSessionCount.optional(),
  unitsPerSession: campaignEditableFields.unitsPerSession.optional(),
  durationMinutes: campaignEditableFields.durationMinutes.optional(),
  candidateSchedule: campaignEditableFields.candidateSchedule.optional(),
  recruitmentDeadlineAt: campaignEditableFields.recruitmentDeadlineAt.optional(),
  balanceDueAt: campaignEditableFields.balanceDueAt.optional(),
  withdrawalPolicy: campaignEditableFields.withdrawalPolicy.optional(),
  notes: campaignEditableFields.notes.optional(),
};

export const updateGroupMatchingCampaignRequestSchema = z
  .object({
    expectedRevision: revisionSchema,
    ...updateableCampaignFields,
    priceTiers: priceTiersSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  });

export const publishGroupMatchingCampaignRequestSchema = z.object({
  expectedRevision: revisionSchema,
});

export const groupMatchingEnrollmentSchema = z.object({
  id: idSchema,
  campaignId: idSchema,
  institutionId: idSchema,
  studentId: idSchema,
  studentNameSnapshot: requiredText(160),
  guardianId: idSchema,
  guardianNameSnapshot: requiredText(160),
  status: groupMatchingEnrollmentStatusSchema,
  schedulePreference: nullableText(1_000),
  notes: nullableText(2_000),
  source: requiredText(40),
  depositAmountMinor: nonnegativeIntegerSchema,
  depositPaymentMethod: groupMatchingDepositPaymentMethodSchema.nullable(),
  depositPaymentReference: nullableText(160),
  depositPaymentNote: nullableText(500),
  depositPaidAt: isoDateTimeSchema.nullable(),
  depositRecordedByUserId: idSchema.nullable(),
  depositRefund: z
    .object({
      id: idSchema,
      amountMinor: positiveAmountSchema,
      currency: z.literal('CNY'),
      refundMethod: groupMatchingDepositPaymentMethodSchema,
      refundReference: nullableText(160),
      refundNote: nullableText(500),
      refundedAt: isoDateTimeSchema,
      recordedByUserId: idSchema,
      idempotencyKey: idempotencyKeySchema,
      enrollmentRevisionBefore: revisionSchema,
      createdAt: isoDateTimeSchema,
    })
    .nullable(),
  withdrawnAt: isoDateTimeSchema.nullable(),
  withdrawalReason: nullableText(500),
  withdrawnByUserId: idSchema.nullable(),
  revision: revisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const groupMatchingEnrollmentListSchema = z.object({
  items: z.array(groupMatchingEnrollmentSchema),
});

export const addGroupMatchingEnrollmentRequestSchema = z.object({
  studentId: idSchema,
  guardianId: idSchema,
  schedulePreference: nullableText(1_000).optional().default(null),
  notes: nullableText(2_000).optional().default(null),
  source: requiredText(40).optional().default('admin'),
});

export const recordGroupMatchingDepositRequestSchema = z.object({
  expectedRevision: revisionSchema,
  paidAmountMinor: positiveAmountSchema,
  paymentMethod: groupMatchingDepositPaymentMethodSchema,
  receivedAt: isoDateTimeSchema.optional(),
  paymentReference: nullableText(160).optional().default(null),
  paymentNote: nullableText(500).optional().default(null),
});

export const recordGroupMatchingDepositRefundRequestSchema = z.object({
  expectedRevision: revisionSchema,
  refundedAmountMinor: positiveAmountSchema,
  refundMethod: groupMatchingDepositPaymentMethodSchema,
  refundedAt: isoDateTimeSchema.optional(),
  refundReference: nullableText(160).optional().default(null),
  refundNote: nullableText(500).optional().default(null),
});

export const withdrawGroupMatchingEnrollmentRequestSchema = z.object({
  expectedRevision: revisionSchema,
  reason: requiredText(500),
});

export const groupMatchingFormationMemberSchema = z.object({
  id: idSchema,
  formationId: idSchema,
  enrollmentId: idSchema,
  studentId: idSchema,
  studentNameSnapshot: requiredText(160),
  guardianId: idSchema,
  guardianNameSnapshot: requiredText(160),
  totalAmountMinor: positiveAmountSchema,
  depositAppliedMinor: nonnegativeIntegerSchema,
  balanceDueMinor: nonnegativeIntegerSchema,
  lessonOrderId: idSchema.nullable(),
  lessonOrderNo: z.string().trim().min(1).max(64).nullable(),
  lessonOrderRevision: revisionSchema.nullable(),
  lessonOrderStatus: z
    .enum([
      'awaiting_settlement',
      'pending_payment',
      'paid_pending_grant',
      'completed',
      'closed',
      'grant_failed',
      'refunding',
      'refunded',
    ])
    .nullable(),
  status: groupMatchingFormationMemberStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const groupMatchingFormationSchema = z.object({
  id: idSchema,
  campaignId: idSchema,
  institutionId: idSchema,
  campaignRevision: revisionSchema,
  titleSnapshot: requiredText(160),
  courseId: idSchema,
  courseNameSnapshot: requiredText(160),
  campusId: idSchema,
  campusNameSnapshot: requiredText(160),
  classroomId: idSchema.nullable(),
  classroomNameSnapshot: requiredText(160).nullable(),
  teacherId: idSchema.nullable(),
  teacherNameSnapshot: requiredText(160).nullable(),
  scheduleDescription: requiredText(1_000),
  finalParticipantCount: participantCountSchema,
  unitPriceMinor: positiveAmountSchema,
  depositAmountMinor: nonnegativeIntegerSchema,
  balanceAmountMinor: nonnegativeIntegerSchema,
  plannedSessionCount: z.number().int().min(2),
  unitsPerSession: positiveIntegerSchema,
  totalUnits: positiveIntegerSchema,
  durationMinutes: positiveIntegerSchema,
  balanceDueAt: isoDateTimeSchema.nullable(),
  lessonPackageId: idSchema.nullable(),
  lessonPackageVersion: positiveIntegerSchema.nullable(),
  confirmedAt: isoDateTimeSchema,
  confirmedByUserId: idSchema,
  createdAt: isoDateTimeSchema,
  selectedLearners: z.array(groupMatchingFormationMemberSchema).min(2).max(500),
});

export const confirmGroupMatchingFormationRequestSchema = z.object({
  expectedRevision: revisionSchema,
  classroomId: idSchema.nullable(),
  teacherId: idSchema.nullable(),
  scheduleDescription: requiredText(1_000),
  selectedEnrollmentIds: z.array(idSchema).min(2).max(500),
  balanceDueAt: isoDateTimeSchema.nullable().optional(),
});

export const cancelGroupMatchingCampaignRequestSchema = z.object({
  expectedRevision: revisionSchema,
  reason: requiredText(500),
});

export const groupMatchingCampaignDetailSchema = z.object({
  campaign: groupMatchingCampaignSchema,
  enrollments: groupMatchingEnrollmentListSchema,
  formation: groupMatchingFormationSchema.nullable(),
});

export type GroupMatchingCampaignStatus = z.infer<typeof groupMatchingCampaignStatusSchema>;
export type GroupMatchingEnrollmentStatus = z.infer<typeof groupMatchingEnrollmentStatusSchema>;
export type GroupMatchingDepositPaymentMethod = z.infer<
  typeof groupMatchingDepositPaymentMethodSchema
>;
export type GroupMatchingFormationMemberStatus = z.infer<
  typeof groupMatchingFormationMemberStatusSchema
>;
export type GroupMatchingPriceTier = z.infer<typeof groupMatchingPriceTierSchema>;
export type GroupMatchingCampaign = z.infer<typeof groupMatchingCampaignSchema>;
export type GroupMatchingCampaignListQuery = z.output<typeof groupMatchingCampaignListQuerySchema>;
export type CreateGroupMatchingCampaignRequest = z.input<
  typeof createGroupMatchingCampaignRequestSchema
>;
export type UpdateGroupMatchingCampaignRequest = z.input<
  typeof updateGroupMatchingCampaignRequestSchema
>;
export type PublishGroupMatchingCampaignRequest = z.infer<
  typeof publishGroupMatchingCampaignRequestSchema
>;
export type GroupMatchingEnrollment = z.infer<typeof groupMatchingEnrollmentSchema>;
export type GroupMatchingDepositRefund = NonNullable<GroupMatchingEnrollment['depositRefund']>;
export type AddGroupMatchingEnrollmentRequest = z.input<
  typeof addGroupMatchingEnrollmentRequestSchema
>;
export type RecordGroupMatchingDepositRequest = z.input<
  typeof recordGroupMatchingDepositRequestSchema
>;
export type RecordGroupMatchingDepositRefundRequest = z.input<
  typeof recordGroupMatchingDepositRefundRequestSchema
>;
export type WithdrawGroupMatchingEnrollmentRequest = z.infer<
  typeof withdrawGroupMatchingEnrollmentRequestSchema
>;
export type GroupMatchingFormationMember = z.infer<typeof groupMatchingFormationMemberSchema>;
export type GroupMatchingFormation = z.infer<typeof groupMatchingFormationSchema>;
export type ConfirmGroupMatchingFormationRequest = z.input<
  typeof confirmGroupMatchingFormationRequestSchema
>;
export type CancelGroupMatchingCampaignRequest = z.infer<
  typeof cancelGroupMatchingCampaignRequestSchema
>;
export type GroupMatchingCampaignDetail = z.infer<typeof groupMatchingCampaignDetailSchema>;
