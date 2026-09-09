import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const peopleStudents = pgTable(
  'people_students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    preferredName: varchar('preferred_name', { length: 120 }),
    grade: varchar('grade', { length: 120 }),
    school: varchar('school', { length: 160 }),
    gender: varchar('gender', { length: 20 })
      .$type<'unknown' | 'female' | 'male' | 'other'>()
      .notNull()
      .default('unknown'),
    birthDate: date('birth_date'),
    notes: varchar('notes', { length: 1_000 }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('people_students_name_idx').on(table.fullName),
    check(
      'people_students_gender_check',
      sql`${table.gender} in ('unknown','female','male','other')`,
    ),
    check('people_students_status_check', sql`${table.status} in ('active','inactive')`),
    check('people_students_revision_check', sql`${table.revision} > 0`),
  ],
);

export const peopleStudentInstitutions = pgTable(
  'people_student_institutions',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => peopleStudents.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(1),
    source: varchar('source', { length: 32 })
      .$type<'manual' | 'legacy_contract' | 'legacy_course_provider' | 'legacy_assignment'>()
      .notNull()
      .default('manual'),
    sourceReference: varchar('source_reference', { length: 200 }),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.studentId, table.institutionId] }),
    index('people_student_institutions_institution_status_idx').on(
      table.institutionId,
      table.status,
    ),
    check(
      'people_student_institutions_status_check',
      sql`${table.status} in ('active','inactive')`,
    ),
    check('people_student_institutions_revision_check', sql`${table.revision} > 0`),
    check(
      'people_student_institutions_source_check',
      sql`${table.source} in ('manual','legacy_contract','legacy_course_provider','legacy_assignment')`,
    ),
  ],
);

export const peopleGuardians = pgTable(
  'people_guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 24 }),
    email: varchar('email', { length: 320 }),
    identityUserId: uuid('identity_user_id').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    notes: varchar('notes', { length: 1_000 }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('people_guardians_identity_user_unique').on(table.identityUserId),
    index('people_guardians_phone_idx').on(table.phone),
    index('people_guardians_email_idx').on(table.email),
    check(
      'people_guardians_contact_check',
      sql`${table.phone} is not null or ${table.email} is not null or ${table.identityUserId} is not null`,
    ),
    check('people_guardians_status_check', sql`${table.status} in ('active','inactive')`),
    check('people_guardians_revision_check', sql`${table.revision} > 0`),
  ],
);

export const peopleStudentGuardians = pgTable(
  'people_student_guardians',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => peopleStudents.id, { onDelete: 'restrict' }),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => peopleGuardians.id, { onDelete: 'restrict' }),
    relationship: varchar('relationship', { length: 60 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'revoked'>()
      .notNull()
      .default('active'),
    verificationStatus: varchar('verification_status', { length: 20 })
      .$type<'verified' | 'unverified'>()
      .notNull()
      .default('unverified'),
    verificationSource: varchar('verification_source', { length: 24 })
      .$type<'admin' | 'invitation' | 'legacy_import'>()
      .notNull()
      .default('legacy_import'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('people_student_guardians_pair_unique').on(table.studentId, table.guardianId),
    uniqueIndex('people_student_guardians_primary_unique')
      .on(table.studentId)
      .where(sql`${table.isPrimary} = true and ${table.status} = 'active'`),
    index('people_student_guardians_guardian_status_idx').on(table.guardianId, table.status),
    check('people_student_guardians_status_check', sql`${table.status} in ('active','revoked')`),
    check(
      'people_student_guardians_verification_status_check',
      sql`${table.verificationStatus} in ('verified','unverified')`,
    ),
    check(
      'people_student_guardians_verification_source_check',
      sql`${table.verificationSource} in ('admin','invitation','legacy_import')`,
    ),
    check(
      'people_student_guardians_verified_at_check',
      sql`(${table.verificationStatus} = 'verified') = (${table.verifiedAt} is not null)`,
    ),
    check('people_student_guardians_revision_check', sql`${table.revision} > 0`),
  ],
);

export const peopleTeachers = pgTable(
  'people_teachers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: varchar('full_name', { length: 120 }).notNull(),
    identityUserId: uuid('identity_user_id').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    phone: varchar('phone', { length: 24 }),
    title: varchar('title', { length: 120 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    tagline: varchar('tagline', { length: 200 }),
    wechatQrUrl: varchar('wechat_qr_url', { length: 500 }),
    education: text('education').notNull().default(''),
    teachingExperience: text('teaching_experience').notNull().default(''),
    teachingStyle: text('teaching_style').notNull().default(''),
    achievements: text('achievements').notNull().default(''),
    teachingYears: varchar('teaching_years', { length: 40 }),
    studentCount: varchar('student_count', { length: 40 }),
    retentionRate: varchar('retention_rate', { length: 40 }),
    teachingPhilosophy: text('teaching_philosophy').notNull().default(''),
    classPhotoUrls: jsonb('class_photo_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    studentWorkUrls: jsonb('student_work_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    parentTestimonials: jsonb('parent_testimonials')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bio: text('bio').notNull().default(''),
    specialties: jsonb('specialties')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isPinned: boolean('is_pinned').notNull().default(false),
    isTrialConsultant: boolean('is_trial_consultant').notNull().default(false),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('people_teachers_identity_user_unique').on(table.identityUserId),
    index('people_teachers_phone_idx').on(table.phone),
    check('people_teachers_status_check', sql`${table.status} in ('active','inactive')`),
    check('people_teachers_revision_check', sql`${table.revision} > 0`),
  ],
);

export const peopleTeacherInstitutions = pgTable(
  'people_teacher_institutions',
  {
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => peopleTeachers.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.teacherId, table.institutionId] }),
    index('people_teacher_institutions_institution_status_idx').on(
      table.institutionId,
      table.status,
    ),
    check(
      'people_teacher_institutions_status_check',
      sql`${table.status} in ('active','inactive')`,
    ),
    check('people_teacher_institutions_revision_check', sql`${table.revision} > 0`),
  ],
);
