import { sql } from 'drizzle-orm';
import {
  check,
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
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  paymentIntentsForeignKeyTarget,
  studentsForeignKeyTarget,
  teachersForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

export const admissionLeads = pgTable(
  'admission_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guardianName: varchar('guardian_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 40 }).notNull(),
    studentName: varchar('student_name', { length: 120 }).notNull(),
    grade: varchar('grade', { length: 80 }),
    source: varchar('source', { length: 120 }),
    sourceDetail: varchar('source_detail', { length: 500 }),
    ownerUserId: uuid('owner_user_id').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 30 })
      .$type<
        | 'new'
        | 'contacted'
        | 'qualified'
        | 'trial_booked'
        | 'trial_attended'
        | 'nurture'
        | 'won'
        | 'lost'
      >()
      .notNull()
      .default('new'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    convertedStudentId: uuid('converted_student_id').references(() => studentsForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('admission_leads_status_idx').on(table.status, table.updatedAt),
    index('admission_leads_phone_idx').on(table.phone),
    index('admission_leads_owner_idx').on(table.ownerUserId, table.status),
    check(
      'admission_leads_status_check',
      sql`${table.status} in ('new','contacted','qualified','trial_booked','trial_attended','nurture','won','lost')`,
    ),
    check('admission_leads_revision_check', sql`${table.revision} > 0`),
  ],
);

export const admissionFollowUps = pgTable(
  'admission_follow_ups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => admissionLeads.id, { onDelete: 'restrict' }),
    content: text('content').notNull(),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('admission_follow_ups_lead_created_idx').on(table.leadId, table.createdAt)],
);

export const admissionTrialSessions = pgTable(
  'admission_trial_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    campusId: uuid('campus_id'),
    courseId: uuid('course_id'),
    teacherId: uuid('teacher_id').references(() => teachersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 160 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    capacity: integer('capacity').notNull(),
    bookedCount: integer('booked_count').notNull().default(0),
    reservationFeeAmountMinor: integer('reservation_fee_amount_minor').notNull().default(0),
    reservationHoldMinutes: integer('reservation_hold_minutes').notNull().default(15),
    reservationRefundCutoffHours: integer('reservation_refund_cutoff_hours').notNull().default(12),
    status: varchar('status', { length: 20 })
      .$type<'open' | 'closed' | 'cancelled' | 'completed'>()
      .notNull()
      .default('open'),
    notes: text('notes'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('admission_trial_sessions_institution_start_idx').on(table.institutionId, table.startsAt),
    check('admission_trial_sessions_capacity_check', sql`${table.capacity} > 0`),
    check(
      'admission_trial_sessions_booked_check',
      sql`${table.bookedCount} >= 0 and ${table.bookedCount} <= ${table.capacity}`,
    ),
    check('admission_trial_sessions_fee_check', sql`${table.reservationFeeAmountMinor} >= 0`),
    check(
      'admission_trial_sessions_hold_check',
      sql`${table.reservationHoldMinutes} between 5 and 60`,
    ),
    check(
      'admission_trial_sessions_refund_cutoff_check',
      sql`${table.reservationRefundCutoffHours} between 0 and 168`,
    ),
    check('admission_trial_sessions_time_check', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'admission_trial_sessions_status_check',
      sql`${table.status} in ('open','closed','cancelled','completed')`,
    ),
    check('admission_trial_sessions_revision_check', sql`${table.revision} > 0`),
  ],
);

export const admissionTrialRegistrations = pgTable(
  'admission_trial_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trialSessionId: uuid('trial_session_id')
      .notNull()
      .references(() => admissionTrialSessions.id, { onDelete: 'restrict' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => admissionLeads.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    trialTitleSnapshot: varchar('trial_title_snapshot', { length: 160 }).notNull(),
    trialStartsAtSnapshot: timestamp('trial_starts_at_snapshot', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<'pending_payment' | 'booked' | 'checked_in' | 'no_show' | 'cancelled' | 'expired'>()
      .notNull()
      .default('booked'),
    guardianNameSnapshot: varchar('guardian_name_snapshot', { length: 120 }),
    phoneSnapshot: varchar('phone_snapshot', { length: 40 }),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 120 }),
    gradeSnapshot: varchar('grade_snapshot', { length: 80 }),
    payerIdentityUserId: uuid('payer_identity_user_id').references(
      () => identityUsersForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    orderNo: varchar('order_no', { length: 64 }),
    receiptNo: varchar('receipt_no', { length: 80 }),
    amountMinor: integer('amount_minor').notNull().default(0),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull().default('CNY'),
    provider: varchar('provider', { length: 32 }).$type<'mock' | 'wechat_pay'>(),
    paymentIntentId: uuid('payment_intent_id').references(() => paymentIntentsForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    paymentStatus: varchar('payment_status', { length: 24 })
      .$type<'not_required' | 'pending' | 'succeeded' | 'failed' | 'closed' | 'refunded'>()
      .notNull()
      .default('not_required'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundCutoffAt: timestamp('refund_cutoff_at', { withTimezone: true }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admission_trial_registrations_pair_unique').on(table.trialSessionId, table.leadId),
    uniqueIndex('admission_trial_registrations_order_no_unique').on(table.orderNo),
    uniqueIndex('admission_trial_registrations_receipt_no_unique').on(table.receiptNo),
    uniqueIndex('admission_trial_registrations_payment_intent_unique').on(table.paymentIntentId),
    uniqueIndex('admission_trial_registrations_active_payer_student_unique')
      .on(table.trialSessionId, table.payerIdentityUserId, table.studentNameSnapshot)
      .where(
        sql`${table.payerIdentityUserId} is not null and ${table.status} in ('pending_payment','booked','checked_in')`,
      ),
    index('admission_trial_registrations_lead_idx').on(table.leadId, table.createdAt),
    index('admission_trial_registrations_payer_idx').on(table.payerIdentityUserId, table.createdAt),
    index('admission_trial_registrations_trial_status_idx').on(table.trialSessionId, table.status),
    check(
      'admission_trial_registrations_status_check',
      sql`${table.status} in ('pending_payment','booked','checked_in','no_show','cancelled','expired')`,
    ),
    check('admission_trial_registrations_amount_check', sql`${table.amountMinor} >= 0`),
    check('admission_trial_registrations_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'admission_trial_registrations_provider_check',
      sql`${table.provider} is null or ${table.provider} in ('mock','wechat_pay')`,
    ),
    check(
      'admission_trial_registrations_payment_status_check',
      sql`${table.paymentStatus} in ('not_required','pending','succeeded','failed','closed','refunded')`,
    ),
    check(
      'admission_trial_registrations_payment_shape_check',
      sql`(${table.amountMinor} = 0 and ${table.paymentStatus} = 'not_required' and ${table.provider} is null and ${table.orderNo} is null and ${table.receiptNo} is null and ${table.paymentIntentId} is null and ${table.expiresAt} is null and ${table.paidAt} is null and ${table.refundCutoffAt} is null) or (${table.amountMinor} > 0 and ${table.paymentStatus} <> 'not_required' and ${table.payerIdentityUserId} is not null and ${table.provider} is not null and ${table.orderNo} is not null and ${table.receiptNo} is not null and ${table.expiresAt} is not null and ${table.refundCutoffAt} is not null)`,
    ),
    check(
      'admission_trial_registrations_pending_check',
      sql`${table.status} <> 'pending_payment' or ${table.paymentStatus} = 'pending'`,
    ),
    check(
      'admission_trial_registrations_paid_check',
      sql`(${table.paymentStatus} in ('succeeded','refunded')) = (${table.paidAt} is not null)`,
    ),
    check(
      'admission_trial_registrations_terminal_payment_check',
      sql`${table.paymentStatus} not in ('failed','closed') or ${table.status} = 'expired'`,
    ),
    check(
      'admission_trial_registrations_checked_in_check',
      sql`(${table.status} = 'checked_in') = (${table.checkedInAt} is not null)`,
    ),
    check('admission_trial_registrations_revision_check', sql`${table.revision} > 0`),
  ],
);
