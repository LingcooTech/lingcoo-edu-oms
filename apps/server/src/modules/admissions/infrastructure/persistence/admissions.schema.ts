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
    status: varchar('status', { length: 20 })
      .$type<'booked' | 'checked_in' | 'no_show' | 'cancelled'>()
      .notNull()
      .default('booked'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('admission_trial_registrations_pair_unique').on(table.trialSessionId, table.leadId),
    index('admission_trial_registrations_lead_idx').on(table.leadId, table.createdAt),
    check(
      'admission_trial_registrations_status_check',
      sql`${table.status} in ('booked','checked_in','no_show','cancelled')`,
    ),
    check(
      'admission_trial_registrations_checked_in_check',
      sql`(${table.status} = 'checked_in') = (${table.checkedInAt} is not null)`,
    ),
  ],
);
