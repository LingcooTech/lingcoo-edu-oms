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

import type { JobAttemptStorageStatus, JobStorageStatus } from '../../domain/model.js';

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 120 }).notNull(),
    queue: varchar('queue', { length: 80 }).notNull().default('default'),
    payload: jsonb('payload').notNull(),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
    payloadVersion: integer('payload_version').notNull().default(1),
    payloadSizeBytes: integer('payload_size_bytes').notNull(),
    status: varchar('status', { length: 20 }).$type<JobStorageStatus>().notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    recoveryCount: integer('recovery_count').notNull().default(0),
    manualRetryCount: integer('manual_retry_count').notNull().default(0),
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
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('jobs_type_deduplication_unique')
      .on(table.type, table.deduplicationHash)
      .where(sql`${table.deduplicationHash} is not null`),
    index('jobs_claim_idx').on(table.status, table.queue, table.runAt, table.priority),
    index('jobs_type_created_idx').on(table.type, table.createdAt),
    index('jobs_status_updated_idx').on(table.status, table.updatedAt),
    index('jobs_lease_idx').on(table.status, table.leaseExpiresAt),
    check(
      'jobs_status_check',
      sql`${table.status} in ('queued', 'running', 'succeeded', 'dead', 'cancelled')`,
    ),
    check('jobs_priority_check', sql`${table.priority} between -100 and 100`),
    check(
      'jobs_attempts_check',
      sql`${table.attemptCount} >= 0 and ${table.maxAttempts} > 0 and ${table.attemptCount} <= ${table.maxAttempts} and ${table.recoveryCount} >= 0 and ${table.manualRetryCount} >= 0`,
    ),
    check(
      'jobs_payload_check',
      sql`${table.payloadVersion} > 0 and ${table.payloadSizeBytes} >= 0`,
    ),
    check(
      'jobs_runtime_check',
      sql`${table.leaseDurationMs} >= 1000 and ${table.executionTimeoutMs} >= ${table.leaseDurationMs} and ${table.backoffBaseMs} >= 100 and ${table.backoffMaxMs} >= ${table.backoffBaseMs}`,
    ),
    check(
      'jobs_deduplication_check',
      sql`(${table.deduplicationHash} is null and ${table.deduplicationPreview} is null) or (${table.deduplicationHash} is not null and ${table.deduplicationPreview} is not null)`,
    ),
    check(
      'jobs_error_status_check',
      sql`${table.lastErrorStatus} is null or ${table.lastErrorStatus} between 400 and 599`,
    ),
    check(
      'jobs_lifecycle_check',
      sql`(
        (${table.status} = 'queued' and ${table.claimToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null and ${table.heartbeatAt} is null and ${table.executionDeadline} is null and ${table.completedAt} is null)
        or
        (${table.status} = 'running' and ${table.claimToken} is not null and ${table.workerId} is not null and ${table.leaseExpiresAt} is not null and ${table.heartbeatAt} is not null and ${table.executionDeadline} is not null and ${table.completedAt} is null)
        or
        (${table.status} in ('succeeded', 'dead', 'cancelled') and ${table.claimToken} is null and ${table.workerId} is null and ${table.leaseExpiresAt} is null and ${table.heartbeatAt} is null and ${table.executionDeadline} is null and ${table.completedAt} is not null)
      )`,
    ),
    check(
      'jobs_dead_error_check',
      sql`${table.status} <> 'dead' or (${table.lastErrorCode} is not null and ${table.lastErrorMessage} is not null and ${table.lastErrorStatus} is not null and ${table.lastErrorRetryable} is not null)`,
    ),
  ],
);

export const jobAttempts = pgTable(
  'job_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: varchar('status', { length: 20 })
      .$type<JobAttemptStorageStatus>()
      .notNull()
      .default('running'),
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
    uniqueIndex('job_attempts_job_number_unique').on(table.jobId, table.attemptNumber),
    index('job_attempts_job_started_idx').on(table.jobId, table.startedAt),
    check('job_attempts_number_check', sql`${table.attemptNumber} > 0`),
    check(
      'job_attempts_status_check',
      sql`${table.status} in ('running', 'succeeded', 'failed', 'timed_out', 'cancelled')`,
    ),
    check(
      'job_attempts_error_status_check',
      sql`${table.errorStatus} is null or ${table.errorStatus} between 400 and 599`,
    ),
    check(
      'job_attempts_lifecycle_check',
      sql`(
        (${table.status} = 'running' and ${table.finishedAt} is null and ${table.errorCode} is null and ${table.errorMessage} is null and ${table.errorStatus} is null and ${table.errorRetryable} is null)
        or
        (${table.status} = 'succeeded' and ${table.finishedAt} is not null and ${table.errorCode} is null and ${table.errorMessage} is null and ${table.errorStatus} is null and ${table.errorRetryable} is null)
        or
        (${table.status} = 'cancelled' and ${table.finishedAt} is not null)
        or
        (${table.status} in ('failed', 'timed_out') and ${table.finishedAt} is not null and ${table.errorCode} is not null and ${table.errorMessage} is not null and ${table.errorStatus} is not null and ${table.errorRetryable} is not null)
      )`,
    ),
  ],
);
