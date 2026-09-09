import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { identityUsersForeignKeyTarget } from '../../../../database/foreign-key-targets.js';

export const applicationBranding = pgTable(
  'application_branding',
  {
    key: varchar('key', { length: 32 }).primaryKey().default('default'),
    appName: varchar('app_name', { length: 120 }).notNull(),
    primaryColor: varchar('primary_color', { length: 7 }).notNull(),
    secondaryColor: varchar('secondary_color', { length: 7 }).notNull().default('#722ed1'),
    backgroundColor: varchar('background_color', { length: 7 }).notNull().default('#f4f6fa'),
    cardColor: varchar('card_color', { length: 7 }).notNull().default('#ffffff'),
    textColor: varchar('text_color', { length: 7 }).notNull().default('#172033'),
    headingFont: varchar('heading_font', { length: 120 })
      .notNull()
      .default(
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      ),
    bodyFont: varchar('body_font', { length: 120 })
      .notNull()
      .default(
        "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      ),
    borderRadius: integer('border_radius').notNull().default(8),
    loginTitle: varchar('login_title', { length: 120 }).notNull(),
    loginSubtitle: varchar('login_subtitle', { length: 240 }).notNull(),
    revision: integer('revision').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
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
    check(
      'application_branding_secondary_color_check',
      sql`${table.secondaryColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    check(
      'application_branding_background_color_check',
      sql`${table.backgroundColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    check('application_branding_card_color_check', sql`${table.cardColor} ~ '^#[0-9A-Fa-f]{6}$'`),
    check('application_branding_text_color_check', sql`${table.textColor} ~ '^#[0-9A-Fa-f]{6}$'`),
    check(
      'application_branding_border_radius_check',
      sql`${table.borderRadius} >= 0 AND ${table.borderRadius} <= 24`,
    ),
  ],
);
