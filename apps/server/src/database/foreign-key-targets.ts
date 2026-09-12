import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

/**
 * Database-only descriptors for foreign-key targets owned by another module.
 *
 * They deliberately expose only stable primary-key metadata. Feature modules
 * must use the owning module's public application port for reads and writes;
 * these descriptors are only for DDL and never for queries.
 */
export const identityUsersForeignKeyTarget = pgTable('identity_users', {
  id: uuid('id').primaryKey(),
});

export const jobsForeignKeyTarget = pgTable('jobs', {
  id: uuid('id').primaryKey(),
});

export const institutionsForeignKeyTarget = pgTable('organization_institutions', {
  id: uuid('id').primaryKey(),
});

export const studentsForeignKeyTarget = pgTable('people_students', {
  id: uuid('id').primaryKey(),
});

export const studentInstitutionsForeignKeyTarget = pgTable(
  'people_student_institutions',
  {
    studentId: uuid('student_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.institutionId] })],
);

export const lessonPackageTemplatesForeignKeyTarget = pgTable('lesson_package_templates', {
  id: uuid('id').primaryKey(),
});

export const lessonPackageVersionsForeignKeyTarget = pgTable('lesson_package_versions', {
  id: uuid('id').primaryKey(),
});

export const lessonAccountsForeignKeyTarget = pgTable('lesson_accounts', {
  id: uuid('id').primaryKey(),
});

export const lessonBatchesForeignKeyTarget = pgTable('lesson_batches', {
  id: uuid('id').primaryKey(),
});

export const lessonMovementsForeignKeyTarget = pgTable('lesson_movements', {
  id: uuid('id').primaryKey(),
});

export const paymentIntentsForeignKeyTarget = pgTable('payment_intents', {
  id: uuid('id').primaryKey(),
});

export const periodCardProductsForeignKeyTarget = pgTable('period_card_products', {
  id: uuid('id').primaryKey(),
});

export const periodCardProductVersionsForeignKeyTarget = pgTable('period_card_product_versions', {
  id: uuid('id').primaryKey(),
});

export const periodCardEntitlementsForeignKeyTarget = pgTable('period_card_entitlements', {
  id: uuid('id').primaryKey(),
});

export const guardiansForeignKeyTarget = pgTable('people_guardians', {
  id: uuid('id').primaryKey(),
});

export const teachersForeignKeyTarget = pgTable('people_teachers', {
  id: uuid('id').primaryKey(),
});

export const teacherInstitutionsForeignKeyTarget = pgTable(
  'people_teacher_institutions',
  {
    teacherId: uuid('teacher_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.teacherId, table.institutionId] })],
);

export const teachingSessionsForeignKeyTarget = pgTable(
  'teaching_sessions',
  {
    id: uuid('id').notNull(),
    institutionId: uuid('institution_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.institutionId] })],
);
