import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { identityUsers } from '../../../identity/public.js';
import type { IdempotencyStorageStatus, StoredResultEnvelope } from '../../domain/model.js';

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: varchar('scope', { length: 120 }).notNull(),
    operation: varchar('operation', { length: 120 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    keyPreview: varchar('key_preview', { length: 32 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    requestHashVersion: integer('request_hash_version').notNull().default(1),
    status: varchar('status', { length: 20 })
      .$type<IdempotencyStorageStatus>()
      .notNull()
      .default('processing'),
    ownerToken: uuid('owner_token'),
    attemptCount: integer('attempt_count').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull(),
    recoveryCount: integer('recovery_count').notNull().default(0),
    resultEnvelope: jsonb('result_envelope').$type<StoredResultEnvelope>(),
    resultSizeBytes: integer('result_size_bytes'),
    lastErrorCode: varchar('last_error_code', { length: 120 }),
    lastErrorMessage: varchar('last_error_message', { length: 500 }),
    lastErrorStatus: integer('last_error_status'),
    lastErrorRetryable: boolean('last_error_retryable'),
    actorId: uuid('actor_id').references(() => identityUsers.id, { onDelete: 'set null' }),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idempotency_records_identity_unique').on(
      table.scope,
      table.operation,
      table.keyHash,
    ),
    index('idempotency_records_status_updated_idx').on(table.status, table.updatedAt),
    index('idempotency_records_operation_created_idx').on(table.operation, table.createdAt),
    index('idempotency_records_expires_idx').on(table.expiresAt),
    check(
      'idempotency_records_status_check',
      sql`${table.status} in ('processing', 'succeeded', 'failed')`,
    ),
    check(
      'idempotency_records_counts_check',
      sql`${table.attemptCount} > 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts} and ${table.recoveryCount} >= 0`,
    ),
    check('idempotency_records_hash_version_check', sql`${table.requestHashVersion} = 1`),
    check(
      'idempotency_records_error_status_check',
      sql`${table.lastErrorStatus} is null or ${table.lastErrorStatus} between 400 and 599`,
    ),
    check(
      'idempotency_records_result_size_check',
      sql`${table.resultSizeBytes} is null or ${table.resultSizeBytes} >= 0`,
    ),
    check(
      'idempotency_records_lifecycle_check',
      sql`(
        (${table.status} = 'processing' and ${table.ownerToken} is not null and ${table.lockedUntil} is not null and ${table.completedAt} is null and ${table.resultEnvelope} is null and ${table.resultSizeBytes} is null)
        or
        (${table.status} = 'succeeded' and ${table.ownerToken} is null and ${table.lockedUntil} is null and ${table.completedAt} is not null and ${table.resultEnvelope} is not null and ${table.resultSizeBytes} is not null)
        or
        (${table.status} = 'failed' and ${table.ownerToken} is null and ${table.lockedUntil} is null and ${table.completedAt} is not null and ${table.resultEnvelope} is null and ${table.resultSizeBytes} is null and ${table.lastErrorCode} is not null and ${table.lastErrorMessage} is not null and ${table.lastErrorStatus} is not null and ${table.lastErrorRetryable} is not null)
      )`,
    ),
  ],
);
