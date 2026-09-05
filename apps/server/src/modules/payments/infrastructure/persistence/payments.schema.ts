import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { identityUsers } from '../../../identity/public.js';

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantReference: varchar('merchant_reference', { length: 200 }).notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    refundedAmountMinor: bigint('refunded_amount_minor', { mode: 'number' }).notNull().default(0),
    currency: char('currency', { length: 3 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('created'),
    providerAppId: varchar('provider_app_id', { length: 200 }).notNull(),
    providerMerchantId: varchar('provider_merchant_id', { length: 200 }).notNull(),
    revision: integer('revision').notNull().default(1),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_intents_merchant_reference_uidx').on(table.merchantReference),
    index('payment_intents_status_created_idx').on(table.status, table.createdAt),
    check('payment_intents_amount_check', sql`${table.amountMinor} > 0`),
    check(
      'payment_intents_refunded_amount_check',
      sql`${table.refundedAmountMinor} >= 0 and ${table.refundedAmountMinor} <= ${table.amountMinor}`,
    ),
    check('payment_intents_revision_check', sql`${table.revision} > 0`),
    check('payment_intents_provider_check', sql`${table.provider} in ('mock')`),
    check(
      'payment_intents_status_check',
      sql`${table.status} in ('created','pending','succeeded','failed','closed','partially_refunded','refunded','unknown')`,
    ),
    check('payment_intents_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const paymentProviderTransactions = pgTable(
  'payment_provider_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    intentId: uuid('intent_id')
      .notNull()
      .references(() => paymentIntents.id, { onDelete: 'restrict' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 200 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    lastQueriedAt: timestamp('last_queried_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_provider_transactions_provider_id_uidx').on(
      table.provider,
      table.providerTransactionId,
    ),
    index('payment_provider_transactions_intent_idx').on(table.intentId, table.createdAt),
    index('payment_provider_transactions_status_idx').on(table.status, table.updatedAt),
    check('payment_provider_transactions_amount_check', sql`${table.amountMinor} > 0`),
    check('payment_provider_transactions_provider_check', sql`${table.provider} in ('mock')`),
    check(
      'payment_provider_transactions_status_check',
      sql`${table.status} in ('pending','succeeded','failed','closed','unknown')`,
    ),
  ],
);

export const paymentCallbacks = pgTable(
  'payment_callbacks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    intentId: uuid('intent_id')
      .notNull()
      .references(() => paymentIntents.id, { onDelete: 'restrict' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 200 }).notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 200 }).notNull(),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    payloadHash: char('payload_hash', { length: 64 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('payment_callbacks_provider_event_uidx').on(table.provider, table.providerEventId),
    index('payment_callbacks_intent_received_idx').on(table.intentId, table.receivedAt),
    check('payment_callbacks_amount_check', sql`${table.amountMinor} > 0`),
    check('payment_callbacks_provider_check', sql`${table.provider} in ('mock')`),
    check(
      'payment_callbacks_event_check',
      sql`${table.eventType} in ('payment.succeeded','payment.failed','payment.closed')`,
    ),
  ],
);

export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    intentId: uuid('intent_id')
      .notNull()
      .references(() => paymentIntents.id, { onDelete: 'restrict' }),
    requestKey: varchar('request_key', { length: 200 }).notNull(),
    providerRefundId: varchar('provider_refund_id', { length: 200 }),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    reason: varchar('reason', { length: 500 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdBy: uuid('created_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_refunds_intent_request_uidx').on(table.intentId, table.requestKey),
    uniqueIndex('payment_refunds_provider_id_uidx')
      .on(table.providerRefundId)
      .where(sql`${table.providerRefundId} is not null`),
    index('payment_refunds_status_created_idx').on(table.status, table.createdAt),
    check('payment_refunds_amount_check', sql`${table.amountMinor} > 0`),
    check(
      'payment_refunds_status_check',
      sql`${table.status} in ('pending','succeeded','failed','unknown')`,
    ),
  ],
);
