import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { identityUsers } from '../../../identity/public.js';

export const applicationBranding = pgTable(
  'application_branding',
  {
    key: varchar('key', { length: 32 }).primaryKey().default('default'),
    appName: varchar('app_name', { length: 120 }).notNull(),
    primaryColor: varchar('primary_color', { length: 7 }).notNull(),
    loginTitle: varchar('login_title', { length: 120 }).notNull(),
    loginSubtitle: varchar('login_subtitle', { length: 240 }).notNull(),
    revision: integer('revision').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('application_branding_singleton_check', sql`${table.key} = 'default'`),
    check('application_branding_revision_check', sql`${table.revision} > 0`),
    check(
      'application_branding_primary_color_check',
      sql`${table.primaryColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
  ],
);
