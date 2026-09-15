import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  studentInstitutionsForeignKeyTarget,
  studentsForeignKeyTarget,
  teacherInstitutionsForeignKeyTarget,
  teachersForeignKeyTarget,
  teachingSessionsForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const teachingResourceCampuses = pgTable(
  'teaching_resource_campuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    code: varchar('code', { length: 80 }),
    address: varchar('address', { length: 300 }),
    latitude: numeric('latitude', { precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric('longitude', { precision: 10, scale: 6, mode: 'number' }),
    environmentImageUrls: jsonb('environment_image_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    notes: varchar('notes', { length: 1_000 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_resource_campuses_name_unique').on(table.name),
    uniqueIndex('teaching_resource_campuses_code_unique')
      .on(table.code)
      .where(sql`${table.code} is not null`),
    check('teaching_resource_campuses_name_check', sql`length(trim(${table.name})) > 0`),
    check('teaching_resource_campuses_status_check', sql`${table.status} in ('active','inactive')`),
    check('teaching_resource_campuses_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceClassrooms = pgTable(
  'teaching_resource_classrooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => teachingResourceCampuses.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    code: varchar('code', { length: 80 }),
    capacity: integer('capacity').notNull(),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    notes: varchar('notes', { length: 1_000 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_resource_classrooms_campus_name_unique').on(table.campusId, table.name),
    uniqueIndex('teaching_resource_classrooms_campus_code_unique')
      .on(table.campusId, table.code)
      .where(sql`${table.code} is not null`),
    uniqueIndex('teaching_resource_classrooms_id_campus_unique').on(table.id, table.campusId),
    index('teaching_resource_classrooms_campus_status_idx').on(table.campusId, table.status),
    check('teaching_resource_classrooms_name_check', sql`length(trim(${table.name})) > 0`),
    check('teaching_resource_classrooms_capacity_check', sql`${table.capacity} > 0`),
    check(
      'teaching_resource_classrooms_status_check',
      sql`${table.status} in ('active','inactive')`,
    ),
    check('teaching_resource_classrooms_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceCourseSeries = pgTable(
  'teaching_resource_course_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    code: varchar('code', { length: 80 }),
    slug: varchar('slug', { length: 120 }),
    description: varchar('description', { length: 2_000 }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    sortOrder: integer('sort_order').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_resource_course_series_institution_name_unique').on(
      table.institutionId,
      table.name,
    ),
    uniqueIndex('teaching_resource_course_series_institution_code_unique')
      .on(table.institutionId, table.code)
      .where(sql`${table.code} is not null`),
    uniqueIndex('teaching_resource_course_series_institution_slug_unique')
      .on(table.institutionId, table.slug)
      .where(sql`${table.slug} is not null`),
    uniqueIndex('teaching_resource_course_series_id_institution_unique').on(
      table.id,
      table.institutionId,
    ),
    index('teaching_resource_course_series_institution_status_idx').on(
      table.institutionId,
      table.status,
    ),
    check('teaching_resource_course_series_name_check', sql`length(trim(${table.name})) > 0`),
    check(
      'teaching_resource_course_series_identifier_check',
      sql`${table.code} is not null or ${table.slug} is not null`,
    ),
    check(
      'teaching_resource_course_series_status_check',
      sql`${table.status} in ('active','inactive')`,
    ),
    check('teaching_resource_course_series_sort_order_check', sql`${table.sortOrder} >= 0`),
    check('teaching_resource_course_series_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceCourses = pgTable(
  'teaching_resource_courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    courseSeriesId: uuid('course_series_id'),
    code: varchar('code', { length: 80 }),
    name: varchar('name', { length: 160 }).notNull(),
    category: varchar('category', { length: 80 }),
    ageRange: varchar('age_range', { length: 80 }),
    durationMinutes: integer('duration_minutes').notNull(),
    status: varchar('status', { length: 20 })
      .$type<'draft' | 'active' | 'inactive'>()
      .notNull()
      .default('draft'),
    summary: varchar('summary', { length: 2_000 }),
    sortOrder: integer('sort_order').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_resource_courses_institution_name_unique').on(
      table.institutionId,
      table.name,
    ),
    uniqueIndex('teaching_resource_courses_institution_code_unique')
      .on(table.institutionId, table.code)
      .where(sql`${table.code} is not null`),
    uniqueIndex('teaching_resource_courses_id_institution_unique').on(
      table.id,
      table.institutionId,
    ),
    foreignKey({
      columns: [table.courseSeriesId, table.institutionId],
      foreignColumns: [teachingResourceCourseSeries.id, teachingResourceCourseSeries.institutionId],
      name: 'teaching_resource_courses_series_institution_fk',
    }).onDelete('restrict'),
    index('teaching_resource_courses_institution_status_idx').on(table.institutionId, table.status),
    check('teaching_resource_courses_name_check', sql`length(trim(${table.name})) > 0`),
    check(
      'teaching_resource_courses_status_check',
      sql`${table.status} in ('draft','active','inactive')`,
    ),
    check('teaching_resource_courses_duration_check', sql`${table.durationMinutes} > 0`),
    check('teaching_resource_courses_sort_order_check', sql`${table.sortOrder} >= 0`),
    check('teaching_resource_courses_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceClassGroups = pgTable(
  'teaching_resource_class_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id'),
    campusId: uuid('campus_id').references(() => teachingResourceCampuses.id, {
      onDelete: 'restrict',
    }),
    classroomId: uuid('classroom_id'),
    name: varchar('name', { length: 160 }).notNull(),
    capacity: integer('capacity').notNull(),
    status: varchar('status', { length: 20 })
      .$type<'recruiting' | 'active' | 'completed' | 'archived'>()
      .notNull()
      .default('recruiting'),
    notes: varchar('notes', { length: 1_000 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_resource_class_groups_institution_name_unique').on(
      table.institutionId,
      table.name,
    ),
    uniqueIndex('teaching_resource_class_groups_id_institution_unique').on(
      table.id,
      table.institutionId,
    ),
    index('teaching_resource_class_groups_institution_status_idx').on(
      table.institutionId,
      table.status,
    ),
    foreignKey({
      columns: [table.courseId, table.institutionId],
      foreignColumns: [teachingResourceCourses.id, teachingResourceCourses.institutionId],
      name: 'teaching_resource_class_groups_course_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.classroomId, table.campusId],
      foreignColumns: [teachingResourceClassrooms.id, teachingResourceClassrooms.campusId],
      name: 'teaching_resource_class_groups_classroom_campus_fk',
    }).onDelete('restrict'),
    check('teaching_resource_class_groups_name_check', sql`length(trim(${table.name})) > 0`),
    check(
      'teaching_resource_class_groups_status_check',
      sql`${table.status} in ('recruiting','active','completed','archived')`,
    ),
    check('teaching_resource_class_groups_capacity_check', sql`${table.capacity} > 0`),
    check(
      'teaching_resource_class_groups_classroom_campus_check',
      sql`${table.classroomId} is null or ${table.campusId} is not null`,
    ),
    check('teaching_resource_class_groups_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceClassMemberships = pgTable(
  'teaching_resource_class_memberships',
  {
    classGroupId: uuid('class_group_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 160 }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.classGroupId, table.studentId] }),
    index('teaching_resource_class_memberships_class_status_idx').on(
      table.classGroupId,
      table.status,
    ),
    foreignKey({
      columns: [table.classGroupId, table.institutionId],
      foreignColumns: [teachingResourceClassGroups.id, teachingResourceClassGroups.institutionId],
      name: 'teaching_resource_class_memberships_class_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.studentId, table.institutionId],
      foreignColumns: [
        studentInstitutionsForeignKeyTarget.studentId,
        studentInstitutionsForeignKeyTarget.institutionId,
      ],
      name: 'teaching_resource_class_memberships_student_institution_fk',
    }).onDelete('restrict'),
    check(
      'teaching_resource_class_memberships_status_check',
      sql`${table.status} in ('active','inactive')`,
    ),
    check('teaching_resource_class_memberships_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceSchedules = pgTable(
  'teaching_resource_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    sessionName: varchar('session_name', { length: 160 }).notNull(),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    timeZone: varchar('time_zone', { length: 100 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    weekdays: integer('weekdays').array().notNull(),
    startTime: time('start_time', { precision: 0 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    defaultUnits: integer('default_units').notNull().default(1),
    courseId: uuid('course_id'),
    classGroupId: uuid('class_group_id'),
    campusId: uuid('campus_id').references(() => teachingResourceCampuses.id, {
      onDelete: 'restrict',
    }),
    classroomId: uuid('classroom_id'),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_resource_schedules_institution_name_unique').on(
      table.institutionId,
      table.name,
    ),
    uniqueIndex('teaching_resource_schedules_id_institution_unique').on(
      table.id,
      table.institutionId,
    ),
    index('teaching_resource_schedules_institution_status_idx').on(
      table.institutionId,
      table.status,
    ),
    foreignKey({
      columns: [table.courseId, table.institutionId],
      foreignColumns: [teachingResourceCourses.id, teachingResourceCourses.institutionId],
      name: 'teaching_resource_schedules_course_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.classGroupId, table.institutionId],
      foreignColumns: [teachingResourceClassGroups.id, teachingResourceClassGroups.institutionId],
      name: 'teaching_resource_schedules_class_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.classroomId, table.campusId],
      foreignColumns: [teachingResourceClassrooms.id, teachingResourceClassrooms.campusId],
      name: 'teaching_resource_schedules_classroom_campus_fk',
    }).onDelete('restrict'),
    check('teaching_resource_schedules_name_check', sql`length(trim(${table.name})) > 0`),
    check(
      'teaching_resource_schedules_status_check',
      sql`${table.status} in ('active','inactive')`,
    ),
    check('teaching_resource_schedules_date_check', sql`${table.endDate} >= ${table.startDate}`),
    check(
      'teaching_resource_schedules_weekdays_check',
      sql`cardinality(${table.weekdays}) between 1 and 7 and ${table.weekdays} <@ array[1,2,3,4,5,6,7]::integer[]`,
    ),
    check(
      'teaching_resource_schedules_duration_check',
      sql`${table.durationMinutes} between 1 and 1440`,
    ),
    check('teaching_resource_schedules_units_check', sql`${table.defaultUnits} > 0`),
    check(
      'teaching_resource_schedules_classroom_campus_check',
      sql`${table.classroomId} is null or ${table.campusId} is not null`,
    ),
    check('teaching_resource_schedules_revision_check', sql`${table.revision} > 0`),
  ],
);

export const teachingResourceScheduleTeachers = pgTable(
  'teaching_resource_schedule_teachers',
  {
    scheduleId: uuid('schedule_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachersForeignKeyTarget.id, { onDelete: 'restrict' }),
    teacherNameSnapshot: varchar('teacher_name_snapshot', { length: 160 }).notNull(),
    role: varchar('role', { length: 20 })
      .$type<'instructor' | 'assistant'>()
      .notNull()
      .default('instructor'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.teacherId] }),
    foreignKey({
      columns: [table.scheduleId, table.institutionId],
      foreignColumns: [teachingResourceSchedules.id, teachingResourceSchedules.institutionId],
      name: 'teaching_resource_schedule_teachers_schedule_institution_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.teacherId, table.institutionId],
      foreignColumns: [
        teacherInstitutionsForeignKeyTarget.teacherId,
        teacherInstitutionsForeignKeyTarget.institutionId,
      ],
      name: 'teaching_resource_schedule_teachers_teacher_institution_fk',
    }).onDelete('restrict'),
    check(
      'teaching_resource_schedule_teachers_role_check',
      sql`${table.role} in ('instructor','assistant')`,
    ),
  ],
);

export const teachingSessionResourceContexts = pgTable(
  'teaching_session_resource_contexts',
  {
    sessionId: uuid('session_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
    scheduleId: uuid('schedule_id'),
    scheduleNameSnapshot: varchar('schedule_name_snapshot', { length: 160 }),
    courseId: uuid('course_id'),
    courseNameSnapshot: varchar('course_name_snapshot', { length: 160 }),
    classGroupId: uuid('class_group_id'),
    classGroupNameSnapshot: varchar('class_group_name_snapshot', { length: 160 }),
    campusId: uuid('campus_id').references(() => teachingResourceCampuses.id, {
      onDelete: 'restrict',
    }),
    campusNameSnapshot: varchar('campus_name_snapshot', { length: 160 }),
    classroomId: uuid('classroom_id'),
    classroomNameSnapshot: varchar('classroom_name_snapshot', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId] }),
    index('teaching_session_resource_contexts_classroom_idx').on(
      table.classroomId,
      table.sessionId,
    ),
    foreignKey({
      columns: [table.sessionId, table.institutionId],
      foreignColumns: [
        teachingSessionsForeignKeyTarget.id,
        teachingSessionsForeignKeyTarget.institutionId,
      ],
      name: 'teaching_session_resource_contexts_session_institution_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.scheduleId, table.institutionId],
      foreignColumns: [teachingResourceSchedules.id, teachingResourceSchedules.institutionId],
      name: 'teaching_session_resource_contexts_schedule_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.courseId, table.institutionId],
      foreignColumns: [teachingResourceCourses.id, teachingResourceCourses.institutionId],
      name: 'teaching_session_resource_contexts_course_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.classGroupId, table.institutionId],
      foreignColumns: [teachingResourceClassGroups.id, teachingResourceClassGroups.institutionId],
      name: 'teaching_session_resource_contexts_class_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.classroomId, table.campusId],
      foreignColumns: [teachingResourceClassrooms.id, teachingResourceClassrooms.campusId],
      name: 'teaching_session_resource_contexts_classroom_campus_fk',
    }).onDelete('restrict'),
  ],
);

export const teachingResourceScheduleOccurrences = pgTable(
  'teaching_resource_schedule_occurrences',
  {
    scheduleId: uuid('schedule_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
    localDate: date('local_date').notNull(),
    sessionId: uuid('session_id').notNull(),
    generatedBy: uuid('generated_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    overrideReason: varchar('override_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.scheduleId, table.localDate] }),
    uniqueIndex('teaching_resource_schedule_occurrences_session_unique').on(table.sessionId),
    foreignKey({
      columns: [table.scheduleId, table.institutionId],
      foreignColumns: [teachingResourceSchedules.id, teachingResourceSchedules.institutionId],
      name: 'teaching_resource_schedule_occurrences_schedule_institution_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.sessionId, table.institutionId],
      foreignColumns: [
        teachingSessionsForeignKeyTarget.id,
        teachingSessionsForeignKeyTarget.institutionId,
      ],
      name: 'teaching_resource_schedule_occurrences_session_institution_fk',
    }).onDelete('restrict'),
  ],
);
