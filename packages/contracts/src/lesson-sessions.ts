import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { pageQuerySchema, pagedResponseSchema } from './common/pagination.js';
import { isoDateTimeSchema } from './common/time.js';
import { lessonUnitsSchema } from './lesson-packages.js';

export const lessonSessionStatusSchema = z.enum(['draft', 'open', 'completed', 'cancelled']);
export const lessonSessionSourceSchema = z.enum(['manual', 'schedule', 'ad_hoc']);
export const lessonSessionAttendanceStatusSchema = z.enum([
  'pending',
  'present',
  'late',
  'leave',
  'absent',
]);
export const lessonSessionConsumptionStatusSchema = z.enum([
  'not_consumed',
  'consumed',
  'reversed',
  'failed',
]);
export const lessonSessionConsumptionSourceSchema = z.enum(['lesson_units', 'period_card']);
export const lessonSessionTeacherRoleSchema = z.enum(['instructor', 'assistant']);

const sessionNameSchema = z.string().trim().min(1).max(160);
const sessionNotesSchema = z.string().trim().max(2_000).nullable();
const optionalReasonSchema = z.string().trim().min(1).max(500).nullable();
const requiredReasonSchema = z.string().trim().min(1).max(500);
const expectedRevisionSchema = z.number().int().positive();
const operationIdSchema = z.uuid();
const consumptionErrorCodeSchema = z.string().trim().min(1).max(100).nullable();
const consumptionErrorMessageSchema = z.string().trim().min(1).max(1_000).nullable();

function hasChronologicalRange(value: { startsAt?: string; endsAt?: string }) {
  return (
    !value.startsAt ||
    !value.endsAt ||
    new Date(value.startsAt).getTime() < new Date(value.endsAt).getTime()
  );
}

function hasUniqueIds(values: string[]) {
  return new Set(values).size === values.length;
}

export const lessonSessionSchema = z.object({
  id: idSchema,
  institutionId: idSchema,
  name: sessionNameSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: lessonSessionStatusSchema,
  source: lessonSessionSourceSchema,
  defaultUnits: lessonUnitsSchema,
  notes: sessionNotesSchema,
  cancellationReason: optionalReasonSchema,
  openedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  revision: expectedRevisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const lessonSessionListQuerySchema = pageQuerySchema
  .extend({
    institutionId: idSchema.optional(),
    search: z.string().trim().min(1).max(160).optional(),
    status: lessonSessionStatusSchema.optional(),
    source: lessonSessionSourceSchema.optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
  })
  .refine(
    (value) =>
      !value.from || !value.to || new Date(value.from).getTime() <= new Date(value.to).getTime(),
    { path: ['to'], message: '结束时间不能早于开始时间' },
  );
export const lessonSessionPageSchema = pagedResponseSchema(lessonSessionSchema);

export const createLessonSessionRequestSchema = z
  .object({
    institutionId: idSchema,
    name: sessionNameSchema,
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    source: lessonSessionSourceSchema.default('manual'),
    defaultUnits: lessonUnitsSchema,
    notes: sessionNotesSchema.optional().default(null),
  })
  .refine(hasChronologicalRange, {
    path: ['endsAt'],
    message: '结束时间必须晚于开始时间',
  });

export const updateLessonSessionRequestSchema = z
  .object({
    expectedRevision: expectedRevisionSchema,
    name: sessionNameSchema.optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
    source: lessonSessionSourceSchema.optional(),
    defaultUnits: lessonUnitsSchema.optional(),
    notes: sessionNotesSchema.optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: '至少提供一个待更新字段',
  })
  .refine(hasChronologicalRange, {
    path: ['endsAt'],
    message: '结束时间必须晚于开始时间',
  });

export const lessonSessionRosterEntrySchema = z.object({
  id: idSchema,
  lessonSessionId: idSchema,
  institutionId: idSchema,
  studentId: idSchema,
  studentNameSnapshot: sessionNameSchema,
  attendanceStatus: lessonSessionAttendanceStatusSchema,
  attendanceRecordedAt: isoDateTimeSchema.nullable(),
  attendanceRecordedBy: idSchema.nullable(),
  consumptionStatus: lessonSessionConsumptionStatusSchema,
  consumptionSource: lessonSessionConsumptionSourceSchema.nullable(),
  plannedUnits: lessonUnitsSchema,
  consumedUnits: lessonUnitsSchema.nullable(),
  movementId: idSchema.nullable(),
  reversalMovementId: idSchema.nullable(),
  periodCardEntitlementId: idSchema.nullable(),
  periodCardUsageId: idSchema.nullable(),
  consumptionOperationId: operationIdSchema.nullable(),
  reversalOperationId: operationIdSchema.nullable(),
  consumedAt: isoDateTimeSchema.nullable(),
  reversedAt: isoDateTimeSchema.nullable(),
  consumptionErrorCode: consumptionErrorCodeSchema,
  consumptionErrorMessage: consumptionErrorMessageSchema,
  revision: expectedRevisionSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export const lessonSessionRosterSchema = z.object({
  items: z.array(lessonSessionRosterEntrySchema),
});

export const lessonSessionTeacherAssignmentSchema = z.object({
  lessonSessionId: idSchema,
  institutionId: idSchema,
  teacherId: idSchema,
  teacherNameSnapshot: sessionNameSchema,
  role: lessonSessionTeacherRoleSchema,
  assignedBy: idSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const lessonSessionTeachersSchema = z.object({
  session: lessonSessionSchema,
  items: z.array(lessonSessionTeacherAssignmentSchema),
});

export const replaceLessonSessionTeachersRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  assignments: z
    .array(
      z.object({
        teacherId: idSchema,
        role: lessonSessionTeacherRoleSchema.default('instructor'),
      }),
    )
    .max(20)
    .refine((items) => hasUniqueIds(items.map((item) => item.teacherId)), {
      message: '同一教师不能重复分配到课次',
    }),
});

export const lessonSessionAttendanceSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  present: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  leave: z.number().int().nonnegative(),
  absent: z.number().int().nonnegative(),
});

export const lessonSessionWorkItemSchema = z.object({
  session: lessonSessionSchema,
  teachers: z.array(lessonSessionTeacherAssignmentSchema),
  attendance: lessonSessionAttendanceSummarySchema,
});
export const lessonSessionWorkPageSchema = pagedResponseSchema(lessonSessionWorkItemSchema);

export const addLessonSessionStudentRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  studentId: idSchema,
});

export const addLessonSessionStudentsRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  studentIds: z
    .array(idSchema)
    .min(1)
    .max(500)
    .refine(hasUniqueIds, { message: '学员 ID 不能重复' }),
});

export const recordLessonSessionAttendanceRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  attendanceStatus: lessonSessionAttendanceStatusSchema,
});

export const lessonSessionAttendanceItemSchema = z.object({
  rosterEntryId: idSchema,
  expectedRevision: expectedRevisionSchema,
  attendanceStatus: lessonSessionAttendanceStatusSchema,
});

export const recordLessonSessionAttendancesRequestSchema = z.object({
  items: z
    .array(lessonSessionAttendanceItemSchema)
    .min(1)
    .max(500)
    .refine((items) => hasUniqueIds(items.map((item) => item.rosterEntryId)), {
      message: '名单记录 ID 不能重复',
    }),
});

export const completeLessonSessionRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
});

export const openLessonSessionRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
});

export const cancelLessonSessionRequestSchema = z.object({
  expectedRevision: expectedRevisionSchema,
  reason: optionalReasonSchema.optional().default(null),
});

const consumptionPaymentSourceFields = {
  consumptionSource: lessonSessionConsumptionSourceSchema.optional().default('lesson_units'),
  periodCardEntitlementId: idSchema.nullable().optional().default(null),
};

function hasValidConsumptionPaymentSource(value: {
  consumptionSource?: 'lesson_units' | 'period_card';
  periodCardEntitlementId?: string | null;
}) {
  return value.consumptionSource === 'period_card'
    ? Boolean(value.periodCardEntitlementId)
    : !value.periodCardEntitlementId;
}

export const consumeLessonSessionStudentRequestSchema = z
  .object({
    operationId: operationIdSchema,
    expectedRevision: expectedRevisionSchema,
    units: lessonUnitsSchema,
    reason: optionalReasonSchema.optional().default(null),
    ...consumptionPaymentSourceFields,
  })
  .refine(hasValidConsumptionPaymentSource, {
    path: ['periodCardEntitlementId'],
    message: '周期卡消课必须指定周期卡权益，普通课时消课不能指定周期卡权益',
  });

export const lessonSessionConsumptionItemSchema = z
  .object({
    rosterEntryId: idSchema,
    expectedRevision: expectedRevisionSchema,
    units: lessonUnitsSchema,
    reason: optionalReasonSchema.optional().default(null),
    ...consumptionPaymentSourceFields,
  })
  .refine(hasValidConsumptionPaymentSource, {
    path: ['periodCardEntitlementId'],
    message: '周期卡消课必须指定周期卡权益，普通课时消课不能指定周期卡权益',
  });

export const consumeLessonSessionStudentsRequestSchema = z.object({
  operationId: operationIdSchema,
  items: z
    .array(lessonSessionConsumptionItemSchema)
    .min(1)
    .max(500)
    .refine((items) => hasUniqueIds(items.map((item) => item.rosterEntryId)), {
      message: '名单记录 ID 不能重复',
    }),
});

export const reverseLessonSessionConsumptionRequestSchema = z.object({
  operationId: operationIdSchema,
  expectedRevision: expectedRevisionSchema,
  reason: requiredReasonSchema,
});

export const lessonSessionConsumptionResultSchema = z.object({
  rosterEntry: lessonSessionRosterEntrySchema,
  movementId: idSchema.nullable(),
  periodCardUsageId: idSchema.nullable(),
  consumedAt: isoDateTimeSchema.nullable(),
  reversedAt: isoDateTimeSchema.nullable(),
  errorCode: consumptionErrorCodeSchema,
  errorMessage: consumptionErrorMessageSchema,
});

export const lessonSessionBulkConsumptionResultSchema = z.object({
  operationId: operationIdSchema,
  items: z.array(lessonSessionConsumptionResultSchema).min(1),
});

export type LessonSessionStatus = z.infer<typeof lessonSessionStatusSchema>;
export type LessonSessionSource = z.infer<typeof lessonSessionSourceSchema>;
export type LessonSessionAttendanceStatus = z.infer<typeof lessonSessionAttendanceStatusSchema>;
export type LessonSessionConsumptionStatus = z.infer<typeof lessonSessionConsumptionStatusSchema>;
export type LessonSessionConsumptionSource = z.infer<typeof lessonSessionConsumptionSourceSchema>;
export type LessonSessionTeacherRole = z.infer<typeof lessonSessionTeacherRoleSchema>;
export type LessonSession = z.infer<typeof lessonSessionSchema>;
export type LessonSessionListQuery = z.output<typeof lessonSessionListQuerySchema>;
export type CreateLessonSessionRequest = z.input<typeof createLessonSessionRequestSchema>;
export type UpdateLessonSessionRequest = z.infer<typeof updateLessonSessionRequestSchema>;
export type LessonSessionRosterEntry = z.infer<typeof lessonSessionRosterEntrySchema>;
export type LessonSessionTeacherAssignment = z.infer<typeof lessonSessionTeacherAssignmentSchema>;
export type ReplaceLessonSessionTeachersRequest = z.infer<
  typeof replaceLessonSessionTeachersRequestSchema
>;
export type LessonSessionAttendanceSummary = z.infer<typeof lessonSessionAttendanceSummarySchema>;
export type LessonSessionWorkItem = z.infer<typeof lessonSessionWorkItemSchema>;
export type AddLessonSessionStudentRequest = z.infer<typeof addLessonSessionStudentRequestSchema>;
export type AddLessonSessionStudentsRequest = z.infer<typeof addLessonSessionStudentsRequestSchema>;
export type RecordLessonSessionAttendanceRequest = z.infer<
  typeof recordLessonSessionAttendanceRequestSchema
>;
export type RecordLessonSessionAttendancesRequest = z.infer<
  typeof recordLessonSessionAttendancesRequestSchema
>;
export type CompleteLessonSessionRequest = z.infer<typeof completeLessonSessionRequestSchema>;
export type OpenLessonSessionRequest = z.infer<typeof openLessonSessionRequestSchema>;
export type CancelLessonSessionRequest = z.infer<typeof cancelLessonSessionRequestSchema>;
export type ConsumeLessonSessionStudentRequest = z.input<
  typeof consumeLessonSessionStudentRequestSchema
>;
export type ConsumeLessonSessionStudentsRequest = z.input<
  typeof consumeLessonSessionStudentsRequestSchema
>;
export type ReverseLessonSessionConsumptionRequest = z.infer<
  typeof reverseLessonSessionConsumptionRequestSchema
>;
export type LessonSessionConsumptionResult = z.infer<typeof lessonSessionConsumptionResultSchema>;
export type LessonSessionBulkConsumptionResult = z.infer<
  typeof lessonSessionBulkConsumptionResultSchema
>;
