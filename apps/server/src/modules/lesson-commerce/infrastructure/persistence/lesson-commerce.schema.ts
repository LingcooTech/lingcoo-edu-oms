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
    packageId: uuid('package_id')
      .notNull()
      .references(() => lessonPackageTemplatesForeignKeyTarget.id, { onDelete: 'restrict' }),
    packageVersionId: uuid('package_version_id')
      .notNull()
      .references(() => lessonPackageVersionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    packageVersion: integer('package_version').notNull(),
    packageName: varchar('package_name', { length: 160 }).notNull(),
    baseUnits: integer('base_units').notNull(),
    bonusUnits: integer('bonus_units').notNull(),
    channel: varchar('channel', { length: 16 })
      .$type<'online' | 'offline'>()
      .notNull()
      .default('online'),
    listedAmountMinor: integer('listed_amount_minor').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).$type<'CNY'>().notNull().default('CNY'),
    provider: varchar('provider', { length: 32 }).$type<'mock' | 'wechat_pay'>(),
    paymentMethod: varchar('payment_method', { length: 32 })
      .$type<'wechat_pay' | 'mock' | 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other'>()
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
    status: varchar('status', { length: 32 })
      .$type<
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
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('lesson_commerce_orders_order_no_unique').on(table.orderNo),
    uniqueIndex('lesson_commerce_orders_receipt_no_unique').on(table.receiptNo),
    uniqueIndex('lesson_commerce_orders_payment_intent_unique').on(table.paymentIntentId),
    uniqueIndex('lesson_commerce_orders_grant_movement_unique').on(table.grantMovementId),
    index('lesson_commerce_orders_guardian_created_idx').on(table.guardianId, table.createdAt),
    index('lesson_commerce_orders_institution_created_idx').on(
      table.institutionId,
      table.createdAt,
    ),
    index('lesson_commerce_orders_student_created_idx').on(table.studentId, table.createdAt),
    check('lesson_commerce_orders_package_version_check', sql`${table.packageVersion} > 0`),
    check('lesson_commerce_orders_base_units_check', sql`${table.baseUnits} > 0`),
    check('lesson_commerce_orders_bonus_units_check', sql`${table.bonusUnits} >= 0`),
    check('lesson_commerce_orders_channel_check', sql`${table.channel} in ('online','offline')`),
    check('lesson_commerce_orders_listed_amount_check', sql`${table.listedAmountMinor} >= 0`),
    check('lesson_commerce_orders_amount_check', sql`${table.amountMinor} > 0`),
    check('lesson_commerce_orders_currency_check', sql`${table.currency} = 'CNY'`),
    check(
      'lesson_commerce_orders_provider_check',
      sql`${table.provider} is null or ${table.provider} in ('mock','wechat_pay')`,
    ),
    check(
      'lesson_commerce_orders_payment_method_check',
      sql`${table.paymentMethod} in ('wechat_pay','mock','cash','bank_transfer','wechat_transfer','other')`,
    ),
    check(
      'lesson_commerce_orders_channel_payment_check',
      sql`(${table.channel} = 'online' and ${table.provider} is not null and ${table.paymentMethod} in ('wechat_pay','mock')) or (${table.channel} = 'offline' and ${table.provider} is null and ${table.paymentIntentId} is null and ${table.paymentMethod} in ('cash','bank_transfer','wechat_transfer','other'))`,
    ),
    check(
      'lesson_commerce_orders_price_adjustment_check',
      sql`${table.listedAmountMinor} = ${table.amountMinor} or ${table.priceAdjustmentReason} is not null`,
    ),
    check(
      'lesson_commerce_orders_status_check',
      sql`${table.status} in ('pending_payment','paid_pending_grant','completed','closed','grant_failed','refunding','refunded')`,
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
      'lesson_commerce_orders_completed_check',
      sql`(${table.status} = 'completed') = (${table.completedAt} is not null and ${table.grantMovementId} is not null)`,
    ),
  ],
);
