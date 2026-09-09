import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  identityUsersForeignKeyTarget,
  institutionsForeignKeyTarget,
  lessonPackageTemplatesForeignKeyTarget,
  lessonPackageVersionsForeignKeyTarget,
  studentsForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const lessonAccounts = pgTable(
  'lesson_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    balanceUnits: integer('balance_units').notNull().default(0),
    lifetimeCreditedUnits: integer('lifetime_credited_units').notNull().default(0),
    lifetimeDebitedUnits: integer('lifetime_debited_units').notNull().default(0),
    lastSequence: integer('last_sequence').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('lesson_accounts_student_institution_unique').on(
      table.studentId,
      table.institutionId,
    ),
    index('lesson_accounts_institution_balance_idx').on(table.institutionId, table.balanceUnits),
    check('lesson_accounts_balance_check', sql`${table.balanceUnits} >= 0`),
    check('lesson_accounts_credited_check', sql`${table.lifetimeCreditedUnits} >= 0`),
    check('lesson_accounts_debited_check', sql`${table.lifetimeDebitedUnits} >= 0`),
    check('lesson_accounts_sequence_check', sql`${table.lastSequence} >= 0`),
    check('lesson_accounts_revision_check', sql`${table.revision} > 0`),
    check(
      'lesson_accounts_conservation_check',
      sql`${table.balanceUnits} = ${table.lifetimeCreditedUnits} - ${table.lifetimeDebitedUnits}`,
    ),
  ],
);

export const lessonBatches = pgTable(
  'lesson_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => lessonAccounts.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    originMovementId: uuid('origin_movement_id').notNull(),
    templateId: uuid('template_id').references(() => lessonPackageTemplatesForeignKeyTarget.id, {
      onDelete: 'restrict',
    }),
    templateVersionId: uuid('template_version_id').references(
      () => lessonPackageVersionsForeignKeyTarget.id,
      { onDelete: 'restrict' },
    ),
    templateRevision: integer('template_revision'),
    templateName: varchar('template_name', { length: 160 }),
    sourceType: varchar('source_type', { length: 32 })
      .$type<
        'offline_purchase' | 'gift' | 'makeup' | 'migration_opening' | 'custom' | 'adjustment'
      >()
      .notNull(),
    sourceReference: varchar('source_reference', { length: 200 }),
    sourceMetadata: jsonb('source_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    reason: varchar('reason', { length: 500 }).notNull(),
    baseUnits: integer('base_units').notNull(),
    bonusUnits: integer('bonus_units').notNull().default(0),
    totalUnits: integer('total_units').notNull(),
    consumedUnits: integer('consumed_units').notNull().default(0),
    withdrawnUnits: integer('withdrawn_units').notNull().default(0),
    remainingUnits: integer('remaining_units').notNull(),
    status: varchar('status', { length: 20 })
      .$type<'available' | 'depleted' | 'reversed'>()
      .notNull()
      .default('available'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('lesson_batches_origin_movement_unique').on(table.originMovementId),
    uniqueIndex('lesson_batches_source_identity_unique')
      .on(table.institutionId, table.studentId, table.sourceType, table.sourceReference)
      .where(sql`${table.sourceReference} is not null`),
    index('lesson_batches_account_available_idx').on(
      table.accountId,
      table.status,
      table.grantedAt,
      table.id,
    ),
    check('lesson_batches_base_units_check', sql`${table.baseUnits} >= 0`),
    check('lesson_batches_bonus_units_check', sql`${table.bonusUnits} >= 0`),
    check('lesson_batches_total_units_check', sql`${table.totalUnits} > 0`),
    check('lesson_batches_consumed_units_check', sql`${table.consumedUnits} >= 0`),
    check('lesson_batches_withdrawn_units_check', sql`${table.withdrawnUnits} >= 0`),
    check('lesson_batches_remaining_units_check', sql`${table.remainingUnits} >= 0`),
    check(
      'lesson_batches_total_math_check',
      sql`${table.totalUnits} = ${table.baseUnits} + ${table.bonusUnits}`,
    ),
    check(
      'lesson_batches_balance_math_check',
      sql`${table.totalUnits} = ${table.consumedUnits} + ${table.withdrawnUnits} + ${table.remainingUnits}`,
    ),
    check(
      'lesson_batches_status_check',
      sql`${table.status} in ('available', 'depleted', 'reversed')`,
    ),
    check(
      'lesson_batches_status_balance_check',
      sql`(${table.status} = 'available' and ${table.remainingUnits} > 0) or (${table.status} in ('depleted', 'reversed') and ${table.remainingUnits} = 0)`,
    ),
    check(
      'lesson_batches_reversed_check',
      sql`${table.status} <> 'reversed' or (${table.consumedUnits} = 0 and ${table.withdrawnUnits} = ${table.totalUnits})`,
    ),
    check(
      'lesson_batches_template_snapshot_check',
      sql`(${table.templateId} is null and ${table.templateVersionId} is null and ${table.templateRevision} is null and ${table.templateName} is null) or (${table.templateId} is not null and ${table.templateVersionId} is not null and ${table.templateRevision} is not null and ${table.templateName} is not null)`,
    ),
  ],
);

export const lessonMovements = pgTable(
  'lesson_movements',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => lessonAccounts.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutionsForeignKeyTarget.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentsForeignKeyTarget.id, { onDelete: 'restrict' }),
    sequence: integer('sequence').notNull(),
    type: varchar('type', { length: 32 })
      .$type<
        | 'grant'
        | 'adjustment_credit'
        | 'adjustment_debit'
        | 'clawback'
        | 'grant_reversal'
        | 'consume'
        | 'consume_reversal'
      >()
      .notNull(),
    direction: varchar('direction', { length: 12 }).$type<'credit' | 'debit'>().notNull(),
    units: integer('units').notNull(),
    balanceBeforeUnits: integer('balance_before_units').notNull(),
    balanceAfterUnits: integer('balance_after_units').notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    sourceReference: varchar('source_reference', { length: 200 }),
    relatedMovementId: uuid('related_movement_id'),
    actorId: uuid('actor_id').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('lesson_movements_account_sequence_unique').on(table.accountId, table.sequence),
    index('lesson_movements_student_institution_created_idx').on(
      table.studentId,
      table.institutionId,
      table.occurredAt,
    ),
    index('lesson_movements_related_idx').on(table.relatedMovementId),
    uniqueIndex('lesson_movements_consume_reversal_unique')
      .on(table.relatedMovementId)
      .where(sql`${table.type} = 'consume_reversal'`),
    check('lesson_movements_sequence_check', sql`${table.sequence} > 0`),
    check('lesson_movements_units_check', sql`${table.units} > 0`),
    check('lesson_movements_before_check', sql`${table.balanceBeforeUnits} >= 0`),
    check('lesson_movements_after_check', sql`${table.balanceAfterUnits} >= 0`),
    check(
      'lesson_movements_type_check',
      sql`${table.type} in ('grant','adjustment_credit','adjustment_debit','clawback','grant_reversal','consume','consume_reversal')`,
    ),
    check('lesson_movements_direction_check', sql`${table.direction} in ('credit','debit')`),
    check(
      'lesson_movements_direction_type_check',
      sql`(${table.direction} = 'credit' and ${table.type} in ('grant','adjustment_credit','consume_reversal')) or (${table.direction} = 'debit' and ${table.type} in ('adjustment_debit','clawback','grant_reversal','consume'))`,
    ),
    check(
      'lesson_movements_balance_math_check',
      sql`(${table.direction} = 'credit' and ${table.balanceAfterUnits} = ${table.balanceBeforeUnits} + ${table.units}) or (${table.direction} = 'debit' and ${table.balanceAfterUnits} = ${table.balanceBeforeUnits} - ${table.units})`,
    ),
  ],
);

export const lessonMovementAllocations = pgTable(
  'lesson_movement_allocations',
  {
    movementId: uuid('movement_id')
      .notNull()
      .references(() => lessonMovements.id, { onDelete: 'restrict' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => lessonBatches.id, { onDelete: 'restrict' }),
    units: integer('units').notNull(),
    batchBalanceBeforeUnits: integer('batch_balance_before_units').notNull(),
    batchBalanceAfterUnits: integer('batch_balance_after_units').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.movementId, table.batchId] }),
    index('lesson_movement_allocations_batch_idx').on(table.batchId, table.createdAt),
    check('lesson_movement_allocations_units_check', sql`${table.units} > 0`),
    check('lesson_movement_allocations_before_check', sql`${table.batchBalanceBeforeUnits} >= 0`),
    check('lesson_movement_allocations_after_check', sql`${table.batchBalanceAfterUnits} >= 0`),
    check(
      'lesson_movement_allocations_math_check',
      sql`${table.batchBalanceAfterUnits} = ${table.batchBalanceBeforeUnits} - ${table.units}`,
    ),
  ],
);
