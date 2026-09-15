import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  guardiansForeignKeyTarget,
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  lessonCommerceOrdersForeignKeyTarget,
  lessonPackageTemplatesForeignKeyTarget,
  studentsForeignKeyTarget,
  teachersForeignKeyTarget,
  teachingCampusesForeignKeyTarget,
  teachingClassroomsForeignKeyTarget,
  teachingCoursesForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const groupMatchingCampaigns = pgTable(
  'group_matching_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    courseId: uuid('course_id')
      .notNull()
      .references(() => teachingCoursesForeignKeyTarget.id, { onDelete: 'restrict' }),
    courseNameSnapshot: varchar('course_name_snapshot', { length: 160 }).notNull(),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => teachingCampusesForeignKeyTarget.id, { onDelete: 'restrict' }),
    campusNameSnapshot: varchar('campus_name_snapshot', { length: 160 }).notNull(),
    minParticipants: integer('min_participants').notNull(),
    maxParticipants: integer('max_participants').notNull(),
    depositAmountMinor: integer('deposit_amount_minor').notNull(),
    plannedSessionCount: integer('planned_session_count').notNull(),
    unitsPerSession: integer('units_per_session').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    candidateSchedule: varchar('candidate_schedule', { length: 1_000 }),
    recruitmentDeadlineAt: timestamp('recruitment_deadline_at', { withTimezone: true }).notNull(),
    balanceDueAt: timestamp('balance_due_at', { withTimezone: true }),
    withdrawalPolicy: varchar('withdrawal_policy', { length: 1_000 }),
    status: varchar('status', { length: 24 })
      .$type<'draft' | 'recruiting' | 'ready' | 'formed' | 'cancelled'>()
      .notNull()
      .default('draft'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'restrict' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    formedAt: timestamp('formed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: varchar('cancellation_reason', { length: 500 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('group_matching_campaigns_institution_title_unique').on(
      table.institutionId,
      table.title,
    ),
    uniqueIndex('group_matching_campaigns_id_institution_unique').on(table.id, table.institutionId),
    index('group_matching_campaigns_institution_status_idx').on(
      table.institutionId,
      table.status,
      table.updatedAt,
    ),
    check(
      'group_matching_campaigns_people_check',
      sql`${table.minParticipants} >= 2 and ${table.maxParticipants} >= ${table.minParticipants}`,
    ),
    check('group_matching_campaigns_deposit_check', sql`${table.depositAmountMinor} >= 0`),
    check('group_matching_campaigns_sessions_check', sql`${table.plannedSessionCount} > 1`),
    check('group_matching_campaigns_units_check', sql`${table.unitsPerSession} > 0`),
    check('group_matching_campaigns_duration_check', sql`${table.durationMinutes} > 0`),
    check(
      'group_matching_campaigns_status_check',
      sql`${table.status} in ('draft','recruiting','ready','formed','cancelled')`,
    ),
    check('group_matching_campaigns_revision_check', sql`${table.revision} > 0`),
    check(
      'group_matching_campaigns_cancellation_shape_check',
      sql`(${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.cancellationReason} is not null) or (${table.status} <> 'cancelled' and ${table.cancelledAt} is null and ${table.cancellationReason} is null)`,
    ),
  ],
);

export const groupMatchingPriceTiers = pgTable(
  'group_matching_price_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => groupMatchingCampaigns.id, { onDelete: 'cascade' }),
    minParticipants: integer('min_participants').notNull(),
    maxParticipants: integer('max_participants').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull().default('CNY'),
    description: varchar('description', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_matching_price_tiers_campaign_range_unique').on(
      table.campaignId,
      table.minParticipants,
      table.maxParticipants,
    ),
    index('group_matching_price_tiers_campaign_idx').on(table.campaignId, table.minParticipants),
    check(
      'group_matching_price_tiers_range_check',
      sql`${table.minParticipants} >= 2 and ${table.maxParticipants} >= ${table.minParticipants}`,
    ),
    check('group_matching_price_tiers_price_check', sql`${table.unitPriceMinor} > 0`),
    check('group_matching_price_tiers_currency_check', sql`${table.currency} = 'CNY'`),
  ],
);

export const groupMatchingEnrollments = pgTable(
  'group_matching_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => groupMatchingCampaigns.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 160 }).notNull(),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardiansForeignKeyTarget.id, { onDelete: 'restrict' }),
    guardianNameSnapshot: varchar('guardian_name_snapshot', { length: 160 }).notNull(),
    status: varchar('status', { length: 24 })
      .$type<
        | 'pending_deposit'
        | 'deposit_paid'
        | 'deposit_refunded'
        | 'selected'
        | 'waitlisted'
        | 'withdrawn'
      >()
      .notNull()
      .default('pending_deposit'),
    schedulePreference: varchar('schedule_preference', { length: 1_000 }),
    notes: text('notes'),
    source: varchar('source', { length: 40 }).notNull().default('admin'),
    depositAmountMinor: integer('deposit_amount_minor').notNull(),
    depositPaymentMethod: varchar('deposit_payment_method', { length: 32 }).$type<
      'cash' | 'bank_transfer' | 'wechat_transfer' | 'other'
    >(),
    depositPaymentReference: varchar('deposit_payment_reference', { length: 160 }),
    depositPaymentNote: varchar('deposit_payment_note', { length: 500 }),
    depositPaidAt: timestamp('deposit_paid_at', { withTimezone: true }),
    depositRecordedByUserId: uuid('deposit_recorded_by_user_id').references(
      () => identityUsersForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawalReason: varchar('withdrawal_reason', { length: 500 }),
    withdrawnByUserId: uuid('withdrawn_by_user_id').references(
      () => identityUsersForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    withdrawalIdempotencyKey: varchar('withdrawal_idempotency_key', { length: 200 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('group_matching_enrollments_campaign_student_unique').on(
      table.campaignId,
      table.studentId,
    ),
    uniqueIndex('group_matching_enrollments_id_institution_campaign_unique').on(
      table.id,
      table.institutionId,
      table.campaignId,
    ),
    index('group_matching_enrollments_campaign_status_idx').on(
      table.campaignId,
      table.status,
      table.createdAt,
    ),
    uniqueIndex('group_matching_enrollments_withdrawal_idempotency_unique').on(
      table.institutionId,
      table.withdrawalIdempotencyKey,
    ),
    check(
      'group_matching_enrollments_status_check',
      sql`${table.status} in ('pending_deposit','deposit_paid','deposit_refunded','selected','waitlisted','withdrawn')`,
    ),
    check('group_matching_enrollments_deposit_check', sql`${table.depositAmountMinor} >= 0`),
    check('group_matching_enrollments_revision_check', sql`${table.revision} > 0`),
    check(
      'group_matching_enrollments_paid_shape_check',
      sql`(${table.status} in ('deposit_paid','deposit_refunded','selected') and ${table.depositPaidAt} is not null and ${table.depositPaymentMethod} is not null and ${table.depositRecordedByUserId} is not null) or (${table.status} in ('pending_deposit','waitlisted') and ${table.depositPaidAt} is null and ${table.depositPaymentMethod} is null and ${table.depositRecordedByUserId} is null) or ${table.status} = 'withdrawn'`,
    ),
    check(
      'group_matching_enrollments_withdrawal_shape_check',
      sql`(${table.status} = 'withdrawn' and ${table.withdrawnAt} is not null and ${table.withdrawalReason} is not null and ${table.withdrawnByUserId} is not null and ${table.withdrawalIdempotencyKey} is not null) or (${table.status} <> 'withdrawn' and ${table.withdrawnAt} is null and ${table.withdrawalReason} is null and ${table.withdrawnByUserId} is null and ${table.withdrawalIdempotencyKey} is null)`,
    ),
  ],
);

export const groupMatchingDepositRefunds = pgTable(
  'group_matching_deposit_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => groupMatchingCampaigns.id, { onDelete: 'restrict' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => groupMatchingEnrollments.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull().default('CNY'),
    refundMethod: varchar('refund_method', { length: 32 })
      .$type<'cash' | 'bank_transfer' | 'wechat_transfer' | 'other'>()
      .notNull(),
    refundReference: varchar('refund_reference', { length: 160 }),
    refundNote: varchar('refund_note', { length: 500 }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }).notNull(),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'restrict' }),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    enrollmentRevisionBefore: integer('enrollment_revision_before').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_matching_deposit_refunds_enrollment_unique').on(table.enrollmentId),
    uniqueIndex('group_matching_deposit_refunds_idempotency_unique').on(
      table.institutionId,
      table.idempotencyKey,
    ),
    index('group_matching_deposit_refunds_campaign_idx').on(table.campaignId, table.createdAt),
    foreignKey({
      name: 'group_matching_deposit_refunds_campaign_institution_fk',
      columns: [table.campaignId, table.institutionId],
      foreignColumns: [groupMatchingCampaigns.id, groupMatchingCampaigns.institutionId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'group_matching_deposit_refunds_enrollment_campaign_institution_fk',
      columns: [table.enrollmentId, table.institutionId, table.campaignId],
      foreignColumns: [
        groupMatchingEnrollments.id,
        groupMatchingEnrollments.institutionId,
        groupMatchingEnrollments.campaignId,
      ],
    }).onDelete('restrict'),
    check('group_matching_deposit_refunds_amount_check', sql`${table.amountMinor} > 0`),
    check('group_matching_deposit_refunds_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'group_matching_deposit_refunds_method_check',
      sql`${table.refundMethod} in ('cash','bank_transfer','wechat_transfer','other')`,
    ),
    check(
      'group_matching_deposit_refunds_revision_check',
      sql`${table.enrollmentRevisionBefore} > 0`,
    ),
  ],
);

export const groupMatchingFormations = pgTable(
  'group_matching_formations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => groupMatchingCampaigns.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    campaignRevision: integer('campaign_revision').notNull(),
    titleSnapshot: varchar('title_snapshot', { length: 160 }).notNull(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => teachingCoursesForeignKeyTarget.id, { onDelete: 'restrict' }),
    courseNameSnapshot: varchar('course_name_snapshot', { length: 160 }).notNull(),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => teachingCampusesForeignKeyTarget.id, { onDelete: 'restrict' }),
    campusNameSnapshot: varchar('campus_name_snapshot', { length: 160 }).notNull(),
    classroomId: uuid('classroom_id').references(() => teachingClassroomsForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    classroomNameSnapshot: varchar('classroom_name_snapshot', { length: 160 }),
    teacherId: uuid('teacher_id').references(() => teachersForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    teacherNameSnapshot: varchar('teacher_name_snapshot', { length: 160 }),
    scheduleDescription: varchar('schedule_description', { length: 1_000 }).notNull(),
    finalParticipantCount: integer('final_participant_count').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    depositAmountMinor: integer('deposit_amount_minor').notNull(),
    balanceAmountMinor: integer('balance_amount_minor').notNull(),
    plannedSessionCount: integer('planned_session_count').notNull(),
    unitsPerSession: integer('units_per_session').notNull(),
    totalUnits: integer('total_units').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    balanceDueAt: timestamp('balance_due_at', { withTimezone: true }),
    lessonPackageId: uuid('lesson_package_id').references(
      () => lessonPackageTemplatesForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    lessonPackageVersion: integer('lesson_package_version'),
    confirmedByUserId: uuid('confirmed_by_user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'restrict' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_matching_formations_campaign_unique').on(table.campaignId),
    index('group_matching_formations_institution_created_idx').on(
      table.institutionId,
      table.createdAt,
    ),
    check('group_matching_formations_people_check', sql`${table.finalParticipantCount} >= 2`),
    check(
      'group_matching_formations_price_check',
      sql`${table.unitPriceMinor} > 0 and ${table.depositAmountMinor} >= 0 and ${table.balanceAmountMinor} >= 0`,
    ),
    check(
      'group_matching_formations_units_check',
      sql`${table.plannedSessionCount} > 1 and ${table.unitsPerSession} > 0 and ${table.totalUnits} = ${table.plannedSessionCount} * ${table.unitsPerSession}`,
    ),
    check('group_matching_formations_duration_check', sql`${table.durationMinutes} > 0`),
    check(
      'group_matching_formations_classroom_snapshot_check',
      sql`(${table.classroomId} is null) = (${table.classroomNameSnapshot} is null)`,
    ),
    check(
      'group_matching_formations_teacher_snapshot_check',
      sql`(${table.teacherId} is null) = (${table.teacherNameSnapshot} is null)`,
    ),
    check(
      'group_matching_formations_package_snapshot_check',
      sql`(${table.lessonPackageId} is null) = (${table.lessonPackageVersion} is null)`,
    ),
  ],
);

export const groupMatchingFormationMembers = pgTable(
  'group_matching_formation_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => groupMatchingFormations.id, { onDelete: 'restrict' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => groupMatchingEnrollments.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 160 }).notNull(),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardiansForeignKeyTarget.id, { onDelete: 'restrict' }),
    guardianNameSnapshot: varchar('guardian_name_snapshot', { length: 160 }).notNull(),
    totalAmountMinor: integer('total_amount_minor').notNull(),
    depositAppliedMinor: integer('deposit_applied_minor').notNull(),
    balanceDueMinor: integer('balance_due_minor').notNull(),
    lessonOrderId: uuid('lesson_order_id').references(
      () => lessonCommerceOrdersForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    status: varchar('status', { length: 24 })
      .$type<'awaiting_order' | 'awaiting_balance' | 'completed' | 'closed'>()
      .notNull()
      .default('awaiting_order'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_matching_formation_members_enrollment_unique').on(table.enrollmentId),
    uniqueIndex('group_matching_formation_members_formation_student_unique').on(
      table.formationId,
      table.studentId,
    ),
    index('group_matching_formation_members_formation_status_idx').on(
      table.formationId,
      table.status,
    ),
    check(
      'group_matching_formation_members_amount_check',
      sql`${table.totalAmountMinor} > 0 and ${table.depositAppliedMinor} >= 0 and ${table.balanceDueMinor} >= 0 and ${table.totalAmountMinor} = ${table.depositAppliedMinor} + ${table.balanceDueMinor}`,
    ),
    check(
      'group_matching_formation_members_status_check',
      sql`${table.status} in ('awaiting_order','awaiting_balance','completed','closed')`,
    ),
  ],
);
