import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  guardiansForeignKeyTarget,
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  lessonMovementsForeignKeyTarget,
  lessonPackageTemplatesForeignKeyTarget,
  lessonPackageVersionsForeignKeyTarget,
  paymentIntentsForeignKeyTarget,
  periodCardEntitlementsForeignKeyTarget,
  periodCardProductsForeignKeyTarget,
  periodCardProductVersionsForeignKeyTarget,
  studentsForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

export const lessonCommerceOrders = pgTable(
  'lesson_commerce_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNo: varchar('order_no', { length: 64 }).notNull(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentName: varchar('student_name', { length: 120 }).notNull(),
    guardianId: uuid('guardian_id')
      .notNull()
      .references(() => guardiansForeignKeyTarget.id, { onDelete: 'restrict' }),
    guardianName: varchar('guardian_name', { length: 120 }).notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'restrict' }),
    sourceType: varchar('source_type', { length: 32 })
      .$type<'normal' | 'group_formation'>()
      .notNull()
      .default('normal'),
    sourceReferenceId: uuid('source_reference_id'),
    productType: varchar('product_type', { length: 24 })
      .$type<'lesson_package' | 'period_card'>()
      .notNull()
      .default('lesson_package'),
    packageId: uuid('package_id').references(() => lessonPackageTemplatesForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    packageVersionId: uuid('package_version_id').references(
      () => lessonPackageVersionsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    packageVersion: integer('package_version'),
    packageName: varchar('package_name', { length: 160 }),
    baseUnits: integer('base_units'),
    bonusUnits: integer('bonus_units'),
    periodCardProductId: uuid('period_card_product_id').references(
      () => periodCardProductsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    periodCardProductVersionId: uuid('period_card_product_version_id').references(
      () => periodCardProductVersionsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    periodCardProductVersion: integer('period_card_product_version'),
    periodCardProductName: varchar('period_card_product_name', { length: 160 }),
    periodCardMode: varchar('period_card_mode', { length: 20 }).$type<'limited' | 'unlimited'>(),
    periodCardUsageLimit: integer('period_card_usage_limit'),
    periodCardDurationUnit: varchar('period_card_duration_unit', { length: 20 }).$type<
      'day' | 'week' | 'month'
    >(),
    periodCardDurationCount: integer('period_card_duration_count'),
    periodCardActivationPolicy: varchar('period_card_activation_policy', { length: 24 }).$type<
      'immediate' | 'on_first_use'
    >(),
    channel: varchar('channel', { length: 16 })
      .$type<'pending' | 'online' | 'offline'>()
      .notNull()
      .default('online'),
    listedAmountMinor: integer('listed_amount_minor').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    depositAppliedMinor: integer('deposit_applied_minor').notNull().default(0),
    balanceDueMinor: integer('balance_due_minor').notNull().default(0),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull().default('CNY'),
    provider: varchar('provider', { length: 32 }).$type<'mock' | 'wechat_pay'>(),
    paymentMethod: varchar('payment_method', { length: 32 })
      .$type<
        'pending' | 'wechat_pay' | 'mock' | 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other'
      >()
      .notNull(),
    paymentReference: varchar('payment_reference', { length: 160 }),
    paymentNote: varchar('payment_note', { length: 500 }),
    priceAdjustmentReason: varchar('price_adjustment_reason', { length: 500 }),
    receiptNo: varchar('receipt_no', { length: 80 }).notNull(),
    paymentIntentId: uuid('payment_intent_id').references(() => paymentIntentsForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    grantMovementId: uuid('grant_movement_id').references(
      () => lessonMovementsForeignKeyTarget.id,
      {
        onDelete: 'restrict',
      },
    ),
    periodCardEntitlementId: uuid('period_card_entitlement_id').references(
      () => periodCardEntitlementsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    status: varchar('status', { length: 32 })
      .$type<
        | 'awaiting_settlement'
        | 'pending_payment'
        | 'paid_pending_grant'
        | 'completed'
        | 'closed'
        | 'grant_failed'
        | 'refunding'
        | 'refunded'
      >()
      .notNull()
      .default('pending_payment'),
    failureCode: varchar('failure_code', { length: 120 }),
    failureMessage: varchar('failure_message', { length: 500 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    paymentDeadlineAt: timestamp('payment_deadline_at', { withTimezone: true }),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('lesson_commerce_orders_order_no_unique').on(table.orderNo),
    uniqueIndex('lesson_commerce_orders_receipt_no_unique').on(table.receiptNo),
    uniqueIndex('lesson_commerce_orders_payment_intent_unique').on(table.paymentIntentId),
    uniqueIndex('lesson_commerce_orders_grant_movement_unique').on(table.grantMovementId),
    uniqueIndex('lesson_commerce_orders_period_card_entitlement_unique').on(
      table.periodCardEntitlementId,
    ),
    uniqueIndex('lesson_commerce_orders_group_formation_student_unique')
      .on(table.sourceType, table.sourceReferenceId, table.studentId)
      .where(
        sql`${table.sourceType} = 'group_formation' and ${table.sourceReferenceId} is not null`,
      ),
    index('lesson_commerce_orders_guardian_created_idx').on(table.guardianId, table.createdAt),
    index('lesson_commerce_orders_institution_created_idx').on(
      table.institutionId,
      table.createdAt,
    ),
    index('lesson_commerce_orders_student_created_idx').on(table.studentId, table.createdAt),
    check(
      'lesson_commerce_orders_product_snapshot_check',
      sql`(${table.productType} = 'lesson_package' and ${table.packageId} is not null and ${table.packageVersionId} is not null and ${table.packageVersion} > 0 and ${table.packageName} is not null and ${table.baseUnits} > 0 and ${table.bonusUnits} >= 0 and ${table.periodCardProductId} is null and ${table.periodCardProductVersionId} is null and ${table.periodCardProductVersion} is null and ${table.periodCardProductName} is null and ${table.periodCardMode} is null and ${table.periodCardUsageLimit} is null and ${table.periodCardDurationUnit} is null and ${table.periodCardDurationCount} is null and ${table.periodCardActivationPolicy} is null) or (${table.productType} = 'period_card' and ${table.packageId} is null and ${table.packageVersionId} is null and ${table.packageVersion} is null and ${table.packageName} is null and ${table.baseUnits} is null and ${table.bonusUnits} is null and ${table.periodCardProductId} is not null and ${table.periodCardProductVersionId} is not null and ${table.periodCardProductVersion} > 0 and ${table.periodCardProductName} is not null and ${table.periodCardMode} in ('limited','unlimited') and ((${table.periodCardMode} = 'limited' and ${table.periodCardUsageLimit} > 0) or (${table.periodCardMode} = 'unlimited' and ${table.periodCardUsageLimit} is null)) and ${table.periodCardDurationUnit} in ('day','week','month') and ${table.periodCardDurationCount} > 0 and ${table.periodCardActivationPolicy} in ('immediate','on_first_use'))`,
    ),
    check(
      'lesson_commerce_orders_source_check',
      sql`(${table.sourceType} = 'normal' and ${table.sourceReferenceId} is null and ${table.depositAppliedMinor} = 0) or (${table.sourceType} = 'group_formation' and ${table.sourceReferenceId} is not null)`,
    ),
    check(
      'lesson_commerce_orders_channel_check',
      sql`${table.channel} in ('pending','online','offline')`,
    ),
    check('lesson_commerce_orders_listed_amount_check', sql`${table.listedAmountMinor} >= 0`),
    check('lesson_commerce_orders_amount_check', sql`${table.amountMinor} > 0`),
    check(
      'lesson_commerce_orders_settlement_amount_check',
      sql`${table.depositAppliedMinor} >= 0 and ${table.balanceDueMinor} >= 0 and ${table.amountMinor} = ${table.depositAppliedMinor} + ${table.balanceDueMinor}`,
    ),
    check('lesson_commerce_orders_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'lesson_commerce_orders_provider_check',
      sql`${table.provider} is null or ${table.provider} in ('mock','wechat_pay')`,
    ),
    check(
      'lesson_commerce_orders_payment_method_check',
      sql`${table.paymentMethod} in ('pending','wechat_pay','mock','cash','bank_transfer','wechat_transfer','other')`,
    ),
    check(
      'lesson_commerce_orders_channel_payment_check',
      sql`(${table.channel} = 'pending' and ${table.provider} is null and ${table.paymentIntentId} is null and ${table.paymentMethod} = 'pending') or (${table.channel} = 'online' and ${table.provider} is not null and ${table.paymentMethod} in ('wechat_pay','mock')) or (${table.channel} = 'offline' and ${table.provider} is null and ${table.paymentIntentId} is null and ${table.paymentMethod} in ('cash','bank_transfer','wechat_transfer','other'))`,
    ),
    check(
      'lesson_commerce_orders_price_adjustment_check',
      sql`${table.listedAmountMinor} = ${table.amountMinor} or ${table.priceAdjustmentReason} is not null`,
    ),
    check(
      'lesson_commerce_orders_status_check',
      sql`${table.status} in ('awaiting_settlement','pending_payment','paid_pending_grant','completed','closed','grant_failed','refunding','refunded')`,
    ),
    check('lesson_commerce_orders_revision_check', sql`${table.revision} > 0`),
    check(
      'lesson_commerce_orders_failure_check',
      sql`(${table.status} = 'grant_failed') = (${table.failureCode} is not null and ${table.failureMessage} is not null)`,
    ),
    check(
      'lesson_commerce_orders_paid_check',
      sql`(${table.status} in ('paid_pending_grant','completed','grant_failed','refunding','refunded')) = (${table.paidAt} is not null)`,
    ),
    check(
      'lesson_commerce_orders_awaiting_settlement_check',
      sql`${table.status} <> 'awaiting_settlement' or (${table.sourceType} = 'group_formation' and ${table.balanceDueMinor} > 0 and ${table.channel} = 'pending')`,
    ),
    check(
      'lesson_commerce_orders_completed_check',
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null and ((${table.productType} = 'lesson_package' and ${table.grantMovementId} is not null and ${table.periodCardEntitlementId} is null) or (${table.productType} = 'period_card' and ${table.grantMovementId} is null and ${table.periodCardEntitlementId} is not null)))`,
    ),
  ],
);
