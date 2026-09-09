import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  lessonMovementsForeignKeyTarget,
  studentInstitutionsForeignKeyTarget,
  studentsForeignKeyTarget,
  teacherInstitutionsForeignKeyTarget,
  teachersForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const teachingSessions = pgTable(
  'teaching_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    source: varchar('source', { length: 20 })
      .$type<'manual' | 'schedule' | 'ad_hoc'>()
      .notNull()
      .default('manual'),
    status: varchar('status', { length: 20 })
      .$type<'draft' | 'open' | 'completed' | 'cancelled'>()
      .notNull()
      .default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    defaultUnits: integer('default_units').notNull().default(1),
    notes: varchar('notes', { length: 2_000 }),
    cancellationReason: varchar('cancellation_reason', { length: 500 }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('teaching_sessions_institution_start_idx').on(
      table.institutionId,
      table.startsAt,
      table.id,
    ),
    index('teaching_sessions_institution_status_idx').on(table.institutionId, table.status),
    uniqueIndex('teaching_sessions_id_institution_unique').on(table.id, table.institutionId),
    check('teaching_sessions_name_check', sql`length(trim(${table.name})) > 0`),
    check('teaching_sessions_source_check', sql`${table.source} in ('manual','schedule','ad_hoc')`),
    check(
      'teaching_sessions_status_check',
      sql`${table.status} in ('draft','open','completed','cancelled')`,
    ),
    check('teaching_sessions_time_check', sql`${table.endsAt} > ${table.startsAt}`),
    check('teaching_sessions_units_check', sql`${table.defaultUnits} > 0`),
    check('teaching_sessions_revision_check', sql`${table.revision} > 0`),
    check(
      'teaching_sessions_lifecycle_check',
      sql`(${table.status} = 'draft' and ${table.openedAt} is null and ${table.completedAt} is null and ${table.cancelledAt} is null) or (${table.status} = 'open' and ${table.openedAt} is not null and ${table.completedAt} is null and ${table.cancelledAt} is null) or (${table.status} = 'completed' and ${table.openedAt} is not null and ${table.completedAt} is not null and ${table.cancelledAt} is null) or (${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.completedAt} is null)`,
    ),
  ],
);

export const teachingSessionAttendances = pgTable(
  'teaching_session_attendances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => teachingSessions.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 160 }).notNull(),
    attendanceStatus: varchar('attendance_status', { length: 20 })
      .$type<'pending' | 'present' | 'late' | 'leave' | 'absent'>()
      .notNull()
      .default('pending'),
    consumptionStatus: varchar('consumption_status', { length: 24 })
      .$type<'not_consumed' | 'consumed' | 'reversed' | 'failed'>()
      .notNull()
      .default('not_consumed'),
    plannedUnits: integer('planned_units').notNull(),
    consumedUnits: integer('consumed_units').notNull().default(0),
    attendanceRecordedAt: timestamp('attendance_recorded_at', { withTimezone: true }),
    attendanceRecordedBy: uuid('attendance_recorded_by').references(
      () => identityUsersForeignKeyTarget.id,
      { onDelete: 'set null' },
    ),
    consumptionMovementId: uuid('consumption_movement_id').references(
      () => lessonMovementsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    reversalMovementId: uuid('reversal_movement_id').references(
      () => lessonMovementsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    consumptionOperationId: uuid('consumption_operation_id'),
    reversalOperationId: uuid('reversal_operation_id'),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    consumptionErrorCode: varchar('consumption_error_code', { length: 100 }),
    consumptionErrorMessage: varchar('consumption_error_message', { length: 1_000 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_session_attendances_session_student_unique').on(
      table.sessionId,
      table.studentId,
    ),
    foreignKey({
      columns: [table.sessionId, table.institutionId],
      foreignColumns: [teachingSessions.id, teachingSessions.institutionId],
      name: 'teaching_session_attendances_session_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.studentId, table.institutionId],
      foreignColumns: [
        studentInstitutionsForeignKeyTarget.studentId,
        studentInstitutionsForeignKeyTarget.institutionId,
      ],
      name: 'teaching_session_attendances_student_institution_fk',
    }).onDelete('restrict'),
    uniqueIndex('teaching_session_attendances_consumption_movement_unique')
      .on(table.consumptionMovementId)
      .where(sql`${table.consumptionMovementId} is not null`),
    uniqueIndex('teaching_session_attendances_reversal_movement_unique')
      .on(table.reversalMovementId)
      .where(sql`${table.reversalMovementId} is not null`),
    index('teaching_session_attendances_session_status_idx').on(
      table.sessionId,
      table.attendanceStatus,
      table.consumptionStatus,
    ),
    index('teaching_session_attendances_student_idx').on(table.studentId, table.createdAt),
    check(
      'teaching_session_attendances_attendance_check',
      sql`${table.attendanceStatus} in ('pending','present','late','leave','absent')`,
    ),
    check(
      'teaching_session_attendances_consumption_check',
      sql`${table.consumptionStatus} in ('not_consumed','consumed','reversed','failed')`,
    ),
    check('teaching_session_attendances_planned_units_check', sql`${table.plannedUnits} > 0`),
    check('teaching_session_attendances_consumed_units_check', sql`${table.consumedUnits} >= 0`),
    check('teaching_session_attendances_revision_check', sql`${table.revision} > 0`),
    check(
      'teaching_session_attendances_consumption_state_check',
      sql`(${table.consumptionStatus} = 'not_consumed' and ${table.consumedUnits} = 0 and ${table.consumptionMovementId} is null and ${table.reversalMovementId} is null and ${table.consumptionOperationId} is null and ${table.reversalOperationId} is null and ${table.consumedAt} is null and ${table.reversedAt} is null) or (${table.consumptionStatus} = 'failed' and ${table.consumedUnits} = 0 and ${table.consumptionMovementId} is null and ${table.reversalMovementId} is null and ${table.consumptionOperationId} is not null and ${table.reversalOperationId} is null and ${table.consumedAt} is null and ${table.reversedAt} is null) or (${table.consumptionStatus} = 'consumed' and ${table.consumedUnits} > 0 and ${table.consumptionMovementId} is not null and ${table.reversalMovementId} is null and ${table.consumptionOperationId} is not null and ${table.reversalOperationId} is null and ${table.consumedAt} is not null and ${table.reversedAt} is null) or (${table.consumptionStatus} = 'reversed' and ${table.consumedUnits} > 0 and ${table.consumptionMovementId} is not null and ${table.reversalMovementId} is not null and ${table.consumptionOperationId} is not null and ${table.reversalOperationId} is not null and ${table.consumedAt} is not null and ${table.reversedAt} is not null)`,
    ),
  ],
);

export const teachingSessionTeachers = pgTable(
  'teaching_session_teachers',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => teachingSessions.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachersForeignKeyTarget.id, { onDelete: 'restrict' }),
    teacherNameSnapshot: varchar('teacher_name_snapshot', { length: 160 }).notNull(),
    role: varchar('role', { length: 20 })
      .$type<'instructor' | 'assistant'>()
      .notNull()
      .default('instructor'),
    assignedBy: uuid('assigned_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.teacherId] }),
    index('teaching_session_teachers_teacher_start_lookup_idx').on(
      table.institutionId,
      table.teacherId,
      table.sessionId,
    ),
    foreignKey({
      columns: [table.sessionId, table.institutionId],
      foreignColumns: [teachingSessions.id, teachingSessions.institutionId],
      name: 'teaching_session_teachers_session_institution_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.teacherId, table.institutionId],
      foreignColumns: [
        teacherInstitutionsForeignKeyTarget.teacherId,
        teacherInstitutionsForeignKeyTarget.institutionId,
      ],
      name: 'teaching_session_teachers_teacher_institution_fk',
    }).onDelete('restrict'),
    check('teaching_session_teachers_role_check', sql`${table.role} in ('instructor','assistant')`),
  ],
);

export type TeachingSessionRecord = typeof teachingSessions.$inferSelect;
export type TeachingSessionAttendanceRecord = typeof teachingSessionAttendances.$inferSelect;
export type TeachingSessionTeacherRecord = typeof teachingSessionTeachers.$inferSelect;
