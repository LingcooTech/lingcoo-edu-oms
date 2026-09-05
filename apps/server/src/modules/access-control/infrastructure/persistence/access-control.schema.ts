import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core';

import { identityUsers } from '../../../identity/public.js';

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
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
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
