import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  text,
} from 'drizzle-orm/pg-core';

import {
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  studentInstitutionsForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const periodCardProducts = pgTable(
  'period_card_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    mode: varchar('mode', { length: 20 }).$type<'limited' | 'unlimited'>().notNull(),
    usageLimit: integer('usage_limit'),
    durationUnit: varchar('duration_unit', { length: 20 })
      .$type<'day' | 'week' | 'month'>()
      .notNull(),
    durationCount: integer('duration_count').notNull(),
    activationPolicy: varchar('activation_policy', { length: 24 })
      .$type<'immediate' | 'on_first_use'>()
      .notNull(),
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
    uniqueIndex('period_card_products_institution_name_unique').on(table.institutionId, table.name),
    uniqueIndex('period_card_products_id_institution_unique').on(table.id, table.institutionId),
    index('period_card_products_institution_status_idx').on(table.institutionId, table.status),
    check('period_card_products_mode_check', sql`${table.mode} in ('limited', 'unlimited')`),
    check(
      'period_card_products_mode_limit_check',
      sql`(${table.mode} = 'limited' and ${table.usageLimit} > 0) or (${table.mode} = 'unlimited' and ${table.usageLimit} is null)`,
    ),
    check(
      'period_card_products_duration_unit_check',
      sql`${table.durationUnit} in ('day', 'week', 'month')`,
    ),
    check('period_card_products_duration_count_check', sql`${table.durationCount} > 0`),
    check(
      'period_card_products_activation_policy_check',
      sql`${table.activationPolicy} in ('immediate', 'on_first_use')`,
    ),
    check('period_card_products_price_amount_check', sql`${table.priceAmount} >= 0`),
    check(
      'period_card_products_online_price_check',
      sql`not ${table.onlineSaleEnabled} or ${table.priceAmount} > 0`,
    ),
    check('period_card_products_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'period_card_products_sale_window_check',
      sql`${table.saleEndsAt} is null or ${table.saleStartsAt} is null or ${table.saleEndsAt} > ${table.saleStartsAt}`,
    ),
    check('period_card_products_status_check', sql`${table.status} in ('active', 'inactive')`),
    check('period_card_products_revision_check', sql`${table.revision} > 0`),
  ],
);

/** Immutable product snapshot referenced by every issued entitlement. */
export const periodCardProductVersions = pgTable(
  'period_card_product_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id').notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    mode: varchar('mode', { length: 20 }).$type<'limited' | 'unlimited'>().notNull(),
    usageLimit: integer('usage_limit'),
    durationUnit: varchar('duration_unit', { length: 20 })
      .$type<'day' | 'week' | 'month'>()
      .notNull(),
    durationCount: integer('duration_count').notNull(),
    activationPolicy: varchar('activation_policy', { length: 24 })
      .$type<'immediate' | 'on_first_use'>()
      .notNull(),
    priceAmount: integer('price_amount').notNull(),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull(),
    onlineSaleEnabled: boolean('online_sale_enabled').notNull(),
    saleStartsAt: timestamp('sale_starts_at', { withTimezone: true }),
    saleEndsAt: timestamp('sale_ends_at', { withTimezone: true }),
    status: varchar('status', { length: 20 }).$type<'active' | 'inactive'>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('period_card_product_versions_product_version_unique').on(
      table.productId,
      table.version,
    ),
    uniqueIndex('period_card_product_versions_id_institution_unique').on(
      table.id,
      table.institutionId,
    ),
    index('period_card_product_versions_institution_created_idx').on(
      table.institutionId,
      table.createdAt,
    ),
    foreignKey({
      name: 'period_card_product_versions_product_institution_fk',
      columns: [table.productId, table.institutionId],
      foreignColumns: [periodCardProducts.id, periodCardProducts.institutionId],
    }).onDelete('restrict'),
    check('period_card_product_versions_version_check', sql`${table.version} > 0`),
    check(
      'period_card_product_versions_mode_check',
      sql`${table.mode} in ('limited', 'unlimited')`,
    ),
    check(
      'period_card_product_versions_mode_limit_check',
      sql`(${table.mode} = 'limited' and ${table.usageLimit} > 0) or (${table.mode} = 'unlimited' and ${table.usageLimit} is null)`,
    ),
    check(
      'period_card_product_versions_duration_unit_check',
      sql`${table.durationUnit} in ('day', 'week', 'month')`,
    ),
    check('period_card_product_versions_duration_count_check', sql`${table.durationCount} > 0`),
    check(
      'period_card_product_versions_activation_policy_check',
      sql`${table.activationPolicy} in ('immediate', 'on_first_use')`,
    ),
    check('period_card_product_versions_price_amount_check', sql`${table.priceAmount} >= 0`),
    check('period_card_product_versions_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'period_card_product_versions_sale_window_check',
      sql`${table.saleEndsAt} is null or ${table.saleStartsAt} is null or ${table.saleEndsAt} > ${table.saleStartsAt}`,
    ),
    check(
      'period_card_product_versions_status_check',
      sql`${table.status} in ('active', 'inactive')`,
    ),
  ],
);

export const periodCardEntitlements = pgTable(
  'period_card_entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull(),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 160 }).notNull(),
    productId: uuid('product_id').notNull(),
    productVersionId: uuid('product_version_id').notNull(),
    productVersion: integer('product_version').notNull(),
    productNameSnapshot: varchar('product_name_snapshot', { length: 160 }).notNull(),
    mode: varchar('mode', { length: 20 }).$type<'limited' | 'unlimited'>().notNull(),
    usageLimit: integer('usage_limit'),
    usedQuantity: integer('used_quantity').notNull().default(0),
    durationUnit: varchar('duration_unit', { length: 20 })
      .$type<'day' | 'week' | 'month'>()
      .notNull(),
    durationCount: integer('duration_count').notNull(),
    activationPolicy: varchar('activation_policy', { length: 24 })
      .$type<'immediate' | 'on_first_use'>()
      .notNull(),
    activationStartsAt: timestamp('activation_starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    issuedBy: uuid('issued_by')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'restrict' }),
    issueOperationId: uuid('issue_operation_id').notNull(),
    lifecycleState: varchar('lifecycle_state', { length: 20 })
      .$type<'active' | 'revoked'>()
      .notNull()
      .default('active'),
    sourceType: varchar('source_type', { length: 20 }).$type<'manual' | 'order'>().notNull(),
    sourceReference: varchar('source_reference', { length: 200 }),
    issuedReason: varchar('issued_reason', { length: 500 }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    revokeOperationId: uuid('revoke_operation_id'),
    revocationReason: varchar('revocation_reason', { length: 500 }),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('period_card_entitlements_issue_operation_unique').on(table.issueOperationId),
    uniqueIndex('period_card_entitlements_revoke_operation_unique')
      .on(table.revokeOperationId)
      .where(sql`${table.revokeOperationId} is not null`),
    uniqueIndex('period_card_entitlements_source_identity_unique')
      .on(table.institutionId, table.studentId, table.sourceType, table.sourceReference)
      .where(sql`${table.sourceReference} is not null`),
    uniqueIndex('period_card_entitlements_id_institution_unique').on(table.id, table.institutionId),
    index('period_card_entitlements_student_institution_idx').on(
      table.studentId,
      table.institutionId,
      table.issuedAt,
    ),
    index('period_card_entitlements_institution_product_idx').on(
      table.institutionId,
      table.productId,
      table.issuedAt,
    ),
    foreignKey({
      name: 'period_card_entitlements_student_institution_fk',
      columns: [table.studentId, table.institutionId],
      foreignColumns: [
        studentInstitutionsForeignKeyTarget.studentId,
        studentInstitutionsForeignKeyTarget.institutionId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_card_entitlements_product_institution_fk',
      columns: [table.productId, table.institutionId],
      foreignColumns: [periodCardProducts.id, periodCardProducts.institutionId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_card_entitlements_version_institution_fk',
      columns: [table.productVersionId, table.institutionId],
      foreignColumns: [periodCardProductVersions.id, periodCardProductVersions.institutionId],
    }).onDelete('restrict'),
    check('period_card_entitlements_product_version_check', sql`${table.productVersion} > 0`),
    check('period_card_entitlements_mode_check', sql`${table.mode} in ('limited', 'unlimited')`),
    check(
      'period_card_entitlements_mode_limit_check',
      sql`(${table.mode} = 'limited' and ${table.usageLimit} > 0 and ${table.usedQuantity} <= ${table.usageLimit}) or (${table.mode} = 'unlimited' and ${table.usageLimit} is null)`,
    ),
    check('period_card_entitlements_used_quantity_check', sql`${table.usedQuantity} >= 0`),
    check(
      'period_card_entitlements_duration_unit_check',
      sql`${table.durationUnit} in ('day', 'week', 'month')`,
    ),
    check('period_card_entitlements_duration_count_check', sql`${table.durationCount} > 0`),
    check(
      'period_card_entitlements_activation_policy_check',
      sql`${table.activationPolicy} in ('immediate', 'on_first_use')`,
    ),
    check(
      'period_card_entitlements_activation_interval_check',
      sql`(${table.activationStartsAt} is null and ${table.endsAt} is null) or (${table.activationStartsAt} is not null and ${table.endsAt} > ${table.activationStartsAt})`,
    ),
    check(
      'period_card_entitlements_immediate_activation_check',
      sql`${table.activationPolicy} <> 'immediate' or ${table.activationStartsAt} is not null`,
    ),
    check(
      'period_card_entitlements_lifecycle_check',
      sql`${table.lifecycleState} in ('active', 'revoked')`,
    ),
    check(
      'period_card_entitlements_source_type_check',
      sql`${table.sourceType} in ('manual', 'order')`,
    ),
    check(
      'period_card_entitlements_revocation_check',
      sql`(${table.lifecycleState} = 'active' and ${table.revokedAt} is null and ${table.revokedBy} is null and ${table.revokeOperationId} is null and ${table.revocationReason} is null) or (${table.lifecycleState} = 'revoked' and ${table.revokedAt} is not null and ${table.revokedBy} is not null and ${table.revokeOperationId} is not null and ${table.revocationReason} is not null)`,
    ),
    check('period_card_entitlements_revision_check', sql`${table.revision} > 0`),
  ],
);

export const periodCardUsages = pgTable(
  'period_card_usages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id').notNull(),
    entitlementId: uuid('entitlement_id').notNull(),
    studentId: uuid('student_id').notNull(),
    studentNameSnapshot: varchar('student_name_snapshot', { length: 160 }).notNull(),
    productNameSnapshot: varchar('product_name_snapshot', { length: 160 }).notNull(),
    sourceReference: varchar('source_reference', { length: 240 }).notNull(),
    quantity: integer('quantity').notNull(),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'reversed'>()
      .notNull()
      .default('active'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    reason: varchar('reason', { length: 500 }),
    operationId: uuid('operation_id').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'restrict' }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    reversalOperationId: uuid('reversal_operation_id'),
    reversalReason: varchar('reversal_reason', { length: 500 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('period_card_usages_operation_unique').on(table.operationId),
    uniqueIndex('period_card_usages_reversal_operation_unique')
      .on(table.reversalOperationId)
      .where(sql`${table.reversalOperationId} is not null`),
    uniqueIndex('period_card_usages_active_source_unique')
      .on(table.institutionId, table.studentId, table.sourceReference)
      .where(sql`${table.status} = 'active'`),
    index('period_card_usages_entitlement_occurred_idx').on(table.entitlementId, table.occurredAt),
    index('period_card_usages_student_institution_occurred_idx').on(
      table.studentId,
      table.institutionId,
      table.occurredAt,
    ),
    foreignKey({
      name: 'period_card_usages_entitlement_institution_fk',
      columns: [table.entitlementId, table.institutionId],
      foreignColumns: [periodCardEntitlements.id, periodCardEntitlements.institutionId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'period_card_usages_student_institution_fk',
      columns: [table.studentId, table.institutionId],
      foreignColumns: [
        studentInstitutionsForeignKeyTarget.studentId,
        studentInstitutionsForeignKeyTarget.institutionId,
      ],
    }).onDelete('restrict'),
    check('period_card_usages_quantity_check', sql`${table.quantity} > 0`),
    check('period_card_usages_status_check', sql`${table.status} in ('active', 'reversed')`),
    check(
      'period_card_usages_reversal_check',
      sql`(${table.status} = 'active' and ${table.reversedAt} is null and ${table.reversedBy} is null and ${table.reversalOperationId} is null and ${table.reversalReason} is null) or (${table.status} = 'reversed' and ${table.reversedAt} is not null and ${table.reversedBy} is not null and ${table.reversalOperationId} is not null and ${table.reversalReason} is not null)`,
    ),
  ],
);
