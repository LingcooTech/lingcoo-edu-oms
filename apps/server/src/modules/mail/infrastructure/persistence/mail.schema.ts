import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
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

import { identityUsers } from '../../../identity/public.js';
import { jobs } from '../../../jobs/public.js';

export const mailTemplateOverrides = pgTable(
  'mail_template_overrides',
  {
    key: varchar('key', { length: 120 }).primaryKey(),
    subjectTemplate: varchar('subject_template', { length: 500 }).notNull(),
    textTemplate: text('text_template').notNull(),
    revision: integer('revision').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('mail_template_overrides_revision_check', sql`${table.revision} > 0`),
    check('mail_template_overrides_text_length_check', sql`length(${table.textTemplate}) <= 20000`),
  ],
);

export const mailDeliveries = pgTable(
  'mail_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    templateKey: varchar('template_key', { length: 120 }).notNull(),
    templateVersion: integer('template_version').notNull(),
    templateRevision: integer('template_revision'),
    recipientHash: char('recipient_hash', { length: 64 }).notNull(),
    recipientPreview: varchar('recipient_preview', { length: 320 }).notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    deduplicationHash: char('deduplication_hash', { length: 64 }),
    encryptedEnvelope: jsonb('encrypted_envelope').notNull(),
    encryptionKeyId: varchar('encryption_key_id', { length: 120 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    transport: varchar('transport', { length: 20 }),
    attemptCount: integer('attempt_count').notNull().default(0),
    simulated: boolean('simulated').notNull().default(false),
    providerMessageId: varchar('provider_message_id', { length: 500 }),
    lastErrorCode: varchar('last_error_code', { length: 120 }),
    lastErrorMessage: varchar('last_error_message', { length: 500 }),
    lastErrorStatus: integer('last_error_status'),
    lastErrorRetryable: boolean('last_error_retryable'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('mail_deliveries_deduplication_uidx')
      .on(table.deduplicationHash)
      .where(sql`${table.deduplicationHash} is not null`),
    uniqueIndex('mail_deliveries_job_uidx')
      .on(table.jobId)
      .where(sql`${table.jobId} is not null`),
    index('mail_deliveries_status_created_idx').on(table.status, table.createdAt),
    index('mail_deliveries_template_created_idx').on(table.templateKey, table.createdAt),
    index('mail_deliveries_recipient_idx').on(table.recipientHash),
    check(
      'mail_deliveries_status_check',
      sql`${table.status} in ('queued', 'sending', 'sent', 'exhausted')`,
    ),
    check('mail_deliveries_template_version_check', sql`${table.templateVersion} > 0`),
    check(
      'mail_deliveries_template_revision_check',
      sql`${table.templateRevision} is null or ${table.templateRevision} > 0`,
    ),
    check('mail_deliveries_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check(
      'mail_deliveries_sent_state_check',
      sql`(${table.status} = 'sent' and ${table.sentAt} is not null) or (${table.status} <> 'sent' and ${table.sentAt} is null)`,
    ),
  ],
);
