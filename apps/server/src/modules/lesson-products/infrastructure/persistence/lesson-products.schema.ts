import { sql } from 'drizzle-orm';
import {
  check,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { institutionsForeignKeyTarget } from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const lessonPackageTemplates = pgTable(
  'lesson_package_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    baseUnits: integer('base_units').notNull(),
    bonusUnits: integer('bonus_units').notNull().default(0),
    priceAmount: integer('price_amount').notNull().default(0),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull().default('CNY'),
    onlineSaleEnabled: boolean('online_sale_enabled').notNull().default(false),
    saleStartsAt: timestamp('sale_starts_at', { withTimezone: true }),
    saleEndsAt: timestamp('sale_ends_at', { withTimezone: true }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('lesson_package_templates_institution_name_unique').on(
      table.institutionId,
      table.name,
    ),
    index('lesson_package_templates_institution_status_idx').on(table.institutionId, table.status),
    check('lesson_package_templates_base_units_check', sql`${table.baseUnits} > 0`),
    check('lesson_package_templates_bonus_units_check', sql`${table.bonusUnits} >= 0`),
    check('lesson_package_templates_price_amount_check', sql`${table.priceAmount} >= 0`),
    check(
      'lesson_package_templates_online_price_check',
      sql`not ${table.onlineSaleEnabled} or ${table.priceAmount} > 0`,
    ),
    check('lesson_package_templates_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'lesson_package_templates_sale_window_check',
      sql`${table.saleEndsAt} is null or ${table.saleStartsAt} is null or ${table.saleEndsAt} > ${table.saleStartsAt}`,
    ),
    check('lesson_package_templates_status_check', sql`${table.status} in ('active', 'inactive')`),
    check('lesson_package_templates_revision_check', sql`${table.revision} > 0`),
  ],
);

/**
 * Immutable commercial snapshot. A grant references one version so later template edits
 * can never rewrite the meaning of an existing batch.
 */
export const lessonPackageVersions = pgTable(
  'lesson_package_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    packageId: uuid('package_id')
      .notNull()
      .references(() => lessonPackageTemplates.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    baseUnits: integer('base_units').notNull(),
    bonusUnits: integer('bonus_units').notNull().default(0),
    priceAmount: integer('price_amount').notNull(),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull(),
    onlineSaleEnabled: boolean('online_sale_enabled').notNull(),
    saleStartsAt: timestamp('sale_starts_at', { withTimezone: true }),
    saleEndsAt: timestamp('sale_ends_at', { withTimezone: true }),
    status: varchar('status', { length: 20 }).$type<'active' | 'inactive'>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('lesson_package_versions_package_version_unique').on(
      table.packageId,
      table.version,
    ),
    index('lesson_package_versions_institution_created_idx').on(
      table.institutionId,
      table.createdAt,
    ),
    check('lesson_package_versions_version_check', sql`${table.version} > 0`),
    check('lesson_package_versions_base_units_check', sql`${table.baseUnits} > 0`),
    check('lesson_package_versions_bonus_units_check', sql`${table.bonusUnits} >= 0`),
    check('lesson_package_versions_price_amount_check', sql`${table.priceAmount} >= 0`),
    check('lesson_package_versions_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'lesson_package_versions_sale_window_check',
      sql`${table.saleEndsAt} is null or ${table.saleStartsAt} is null or ${table.saleEndsAt} > ${table.saleStartsAt}`,
    ),
    check('lesson_package_versions_status_check', sql`${table.status} in ('active', 'inactive')`),
  ],
);
