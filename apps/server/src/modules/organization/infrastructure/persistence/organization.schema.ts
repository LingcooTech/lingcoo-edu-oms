import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export interface InstitutionMediaItemRecord {
  imageUrl: string;
  caption: string;
}

export const organizationProfile = pgTable(
  'organization_profile',
  {
    key: varchar('key', { length: 32 }).primaryKey().default('default'),
    name: varchar('name', { length: 160 }).notNull(),
    brandName: varchar('brand_name', { length: 160 }).notNull(),
    logoUrl: varchar('logo_url', { length: 500 }),
    phone: varchar('phone', { length: 40 }),
    address: varchar('address', { length: 255 }),
    operationMode: varchar('operation_mode', { length: 32 })
      .$type<'self_operated_only' | 'mixed'>()
      .notNull()
      .default('mixed'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('organization_profile_singleton_check', sql`${table.key} = 'default'`),
    check(
      'organization_profile_operation_mode_check',
      sql`${table.operationMode} in ('self_operated_only', 'mixed')`,
    ),
    check('organization_profile_revision_check', sql`${table.revision} > 0`),
  ],
);

export const organizationInstitutions = pgTable(
  'organization_institutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    type: varchar('type', { length: 32 }).$type<'self_operated' | 'partner'>().notNull(),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'inactive'>()
      .notNull()
      .default('active'),
    contactName: varchar('contact_name', { length: 120 }),
    contactPhone: varchar('contact_phone', { length: 40 }),
    address: varchar('address', { length: 300 }),
    logoUrl: varchar('logo_url', { length: 500 }),
    intro: text('intro').notNull().default(''),
    qualificationItems: jsonb('qualification_items')
      .$type<InstitutionMediaItemRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    outcomeItems: jsonb('outcome_items')
      .$type<InstitutionMediaItemRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    contact: varchar('contact', { length: 200 }),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: varchar('notes', { length: 1_000 }),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_institutions_name_unique').on(table.name),
    index('organization_institutions_status_type_idx').on(table.status, table.type),
    check(
      'organization_institutions_type_check',
      sql`${table.type} in ('self_operated', 'partner')`,
    ),
    check('organization_institutions_status_check', sql`${table.status} in ('active', 'inactive')`),
    check('organization_institutions_sort_order_check', sql`${table.sortOrder} >= 0`),
    check('organization_institutions_revision_check', sql`${table.revision} > 0`),
  ],
);
