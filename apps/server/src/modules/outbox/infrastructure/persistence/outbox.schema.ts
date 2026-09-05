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
  primaryKey,
} from 'drizzle-orm/pg-core';

import type { OutboxAttemptStorageStatus, OutboxStorageStatus } from '../../domain/model.js';

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: varchar('topic', { length: 120 }).notNull(),
    eventVersion: integer('event_version').notNull(),
    aggregateType: varchar('aggregate_type', { length: 120 }),
    aggregateId: varchar('aggregate_id', { length: 200 }),
    aggregateVersion: integer('aggregate_version'),
    payload: jsonb('payload').notNull(),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    payloadSizeBytes: integer('payload_size_bytes').notNull(),
    status: varchar('status', { length: 20 })
      .$type<OutboxStorageStatus>()
      .notNull()
      .default('pending'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    recoveryCount: integer('recovery_count').notNull().default(0),
    manualReplayCount: integer('manual_replay_count').notNull().default(0),
    leaseDurationMs: integer('lease_duration_ms').notNull(),
    executionTimeoutMs: integer('execution_timeout_ms').notNull(),
    backoffBaseMs: integer('backoff_base_ms').notNull(),
    backoffMaxMs: integer('backoff_max_ms').notNull(),
    deduplicationHash: varchar('deduplication_hash', { length: 64 }),
    deduplicationPreview: varchar('deduplication_preview', { length: 32 }),
    claimToken: uuid('claim_token'),
    workerId: varchar('worker_id', { length: 200 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    executionDeadline: timestamp('execution_deadline', { withTimezone: true }),
    lastErrorCode: varchar('last_error_code', { length: 120 }),
    lastErrorMessage: varchar('last_error_message', { length: 500 }),
    lastErrorStatus: integer('last_error_status'),
    lastErrorRetryable: boolean('last_error_retryable'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('outbox_events_topic_deduplication_unique')
      .on(table.topic, table.deduplicationHash)
      .where(sql`${table.deduplicationHash} is not null`),
    uniqueIndex('outbox_events_aggregate_version_unique')
      .on(table.aggregateType, table.aggregateId, table.aggregateVersion)
      .where(sql`${table.aggregateType} is not null`),
    index('outbox_events_claim_idx').on(table.status, table.availableAt, table.createdAt),
    index('outbox_events_topic_created_idx').on(table.topic, table.createdAt),
    index('outbox_events_lease_idx').on(table.status, table.leaseExpiresAt),
    check(
      'outbox_events_status_check',
      sql`${table.status} in ('pending', 'publishing', 'published', 'dead')`,
    ),
    check('outbox_events_version_check', sql`${table.eventVersion} > 0`),
    check('outbox_events_payload_check', sql`${table.payloadSizeBytes} >= 0`),
    check(
      'outbox_events_aggregate_check',
      sql`(${table.aggregateType} is null and ${table.aggregateId} is null and ${table.aggregateVersion} is null) or (${table.aggregateType} is not null and ${table.aggregateId} is not null and ${table.aggregateVersion} > 0)`,
    ),
    check(
      'outbox_events_attempts_check',
      sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts} and ${table.recoveryCount} >= 0 and ${table.manualReplayCount} >= 0`,
    ),
    check(
      'outbox_events_runtime_check',
      sql`${table.leaseDurationMs} >= 1000 and ${table.executionTimeoutMs} >= ${table.leaseDurationMs} and ${table.backoffBaseMs} >= 100 and ${table.backoffMaxMs} >= ${table.backoffBaseMs}`,
    ),
    check(
      'outbox_events_deduplication_check',
      sql`(${table.deduplicationHash} is null and ${table.deduplicationPreview} is null) or (${table.deduplicationHash} is not null and ${table.deduplicationPreview} is not null)`,
    ),
    check(
      'outbox_events_error_status_check',
      sql`${table.lastErrorStatus} is null or ${table.lastErrorStatus} between 400 and 599`,
    ),
    check(
      'outbox_events_lifecycle_check',
      sql`(
        (${table.status} = 'pending' and ${table.claimToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null and ${table.heartbeatAt} is null and ${table.executionDeadline} is null and ${table.publishedAt} is null)
        or
        (${table.status} = 'publishing' and ${table.claimToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null and ${table.heartbeatAt} is not null and ${table.executionDeadline} is not null and ${table.publishedAt} is null)
        or
        (${table.status} = 'published' and ${table.claimToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null and ${table.heartbeatAt} is null and ${table.executionDeadline} is null and ${table.publishedAt} is not null)
        or
        (${table.status} = 'dead' and ${table.claimToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null and ${table.heartbeatAt} is null and ${table.executionDeadline} is null and ${table.publishedAt} is null)
      )`,
    ),
    check(
      'outbox_events_dead_error_check',
      sql`${table.status} <> 'dead' or (${table.lastErrorCode} is not null and ${table.lastErrorMessage} is not null and ${table.lastErrorStatus} is not null and ${table.lastErrorRetryable} = false)`,
    ),
  ],
);

export const outboxAttempts = pgTable(
  'outbox_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => outboxEvents.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: varchar('status', { length: 20 })
      .$type<OutboxAttemptStorageStatus>()
      .notNull()
      .default('publishing'),
    claimToken: uuid('claim_token').notNull(),
    workerId: varchar('worker_id', { length: 200 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorCode: varchar('error_code', { length: 120 }),
    errorMessage: varchar('error_message', { length: 500 }),
    errorStatus: integer('error_status'),
    errorRetryable: boolean('error_retryable'),
  },
  (table) => [
    uniqueIndex('outbox_attempts_event_number_unique').on(table.eventId, table.attemptNumber),
    index('outbox_attempts_event_started_idx').on(table.eventId, table.startedAt),
    check('outbox_attempts_number_check', sql`${table.attemptNumber} > 0`),
    check(
      'outbox_attempts_status_check',
      sql`${table.status} in ('publishing', 'published', 'failed', 'timed_out')`,
    ),
    check(
      'outbox_attempts_error_status_check',
      sql`${table.errorStatus} is null or ${table.errorStatus} between 400 and 599`,
    ),
    check(
      'outbox_attempts_lifecycle_check',
      sql`(
        (${table.status} = 'publishing' and ${table.finishedAt} is null and ${table.errorCode} is null and ${table.errorMessage} is null and ${table.errorStatus} is null and ${table.errorRetryable} is null)
        or
        (${table.status} = 'published' and ${table.finishedAt} is not null and ${table.errorCode} is null and ${table.errorMessage} is null and ${table.errorStatus} is null and ${table.errorRetryable} is null)
        or
        (${table.status} in ('failed', 'timed_out') and ${table.finishedAt} is not null and ${table.errorCode} is not null and ${table.errorMessage} is not null and ${table.errorStatus} is not null and ${table.errorRetryable} is not null)
      )`,
    ),
  ],
);

export const outboxConsumerReceipts = pgTable(
  'outbox_consumer_receipts',
  {
    consumer: varchar('consumer', { length: 120 }).notNull(),
    eventId: uuid('event_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.consumer, table.eventId] }),
    index('outbox_consumer_receipts_processed_idx').on(table.processedAt),
  ],
);
