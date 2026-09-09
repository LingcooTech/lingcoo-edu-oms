import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { TeacherCapabilities } from '@lingcoo-edu-oms/contracts';

import {
  guardiansForeignKeyTarget,
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  teachersForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const accessPermissions = pgTable(
  'access_permissions',
  {
    key: varchar('key', { length: 120 }).primaryKey(),
    source: varchar('source', { length: 80 }).notNull(),
    group: varchar('group', { length: 80 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 300 }).notNull().default(''),
    ...timestamps,
  },
  (table) => [index('access_permissions_source_idx').on(table.source)],
);

export const accessRoles = pgTable(
  'access_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 120 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 300 }),
    system: boolean('system').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('access_roles_key_unique').on(table.key)],
);

export const accessRolePermissions = pgTable(
  'access_role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => accessRoles.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 120 })
      .notNull()
      .references(() => accessPermissions.key, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionKey] }),
    index('access_role_permissions_permission_idx').on(table.permissionKey),
  ],
);

export const accessUserRoles = pgTable(
  'access_user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => accessRoles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('access_user_roles_role_idx').on(table.roleId),
  ],
);

// Domain profile UUIDs are references for the future education modules, not authentication IDs.
// No default institution: a missing binding always denies scoped access.
export const accessEducationAssignments = pgTable(
  'access_education_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 40 })
      .$type<'institution_admin' | 'teacher' | 'parent'>()
      .notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    teacherId: uuid('teacher_id').references(() => teachersForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    guardianId: uuid('guardian_id').references(() => guardiansForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    teacherCapabilities: jsonb('teacher_capabilities')
      .$type<TeacherCapabilities>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('access_education_assignments_scope_unique').on(
      table.userId,
      table.role,
      table.institutionId,
    ),
    index('access_education_assignments_institution_idx').on(table.institutionId),
    check(
      'access_education_assignments_role_check',
      sql`${table.role} in ('institution_admin', 'teacher', 'parent')`,
    ),
    check(
      'access_education_assignments_teacher_check',
      sql`(${table.role} = 'teacher') = (${table.teacherId} is not null)`,
    ),
    check(
      'access_education_assignments_guardian_check',
      sql`(${table.role} = 'parent') = (${table.guardianId} is not null)`,
    ),
    check(
      'access_education_assignments_capabilities_check',
      sql`jsonb_typeof(${table.teacherCapabilities}) = 'object'`,
    ),
  ],
);
