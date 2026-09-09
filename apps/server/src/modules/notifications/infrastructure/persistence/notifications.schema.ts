import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type { NotificationChannel } from '@lingcoo-edu-oms/contracts';

import {
  identityUsersForeignKeyTarget,
  jobsForeignKeyTarget,
} from '../../../../database/foreign-key-targets.js';

export const notificationAnnouncements = pgTable(
  'notification_announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    audienceType: varchar('audience_type', { length: 30 }).notNull(),
    channels: jsonb('channels').$type<NotificationChannel[]>().notNull().default(['in_app']),
    level: varchar('level', { length: 20 }).notNull().default('info'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    ctaLabel: varchar('cta_label', { length: 80 }),
    ctaUrl: text('cta_url'),
    deduplicationHash: char('deduplication_hash', { length: 64 }).notNull(),
    createRequestHash: char('create_request_hash', { length: 64 }).notNull(),
    recipientCount: integer('recipient_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    revision: integer('revision').notNull().default(1),
    publishJobId: uuid('publish_job_id').references(() => jobsForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    createdBy: uuid('created_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => identityUsersForeignKeyTarget.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notification_announcements_dedupe_uidx').on(table.deduplicationHash),
    uniqueIndex('notification_announcements_publish_job_uidx')
      .on(table.publishJobId)
      .where(sql`${table.publishJobId} is not null`),
    index('notification_announcements_status_created_idx').on(table.status, table.createdAt),
    check(
      'notification_announcements_status_check',
      sql`${table.status} in ('draft', 'publishing', 'published', 'withdrawn')`,
    ),
    check(
      'notification_announcements_audience_check',
      sql`${table.audienceType} in ('all_active_users', 'selected_users')`,
    ),
    check(
      'notification_announcements_level_check',
      sql`${table.level} in ('info', 'success', 'warning', 'error')`,
    ),
    check('notification_announcements_revision_check', sql`${table.revision} > 0`),
    check(
      'notification_announcements_counts_check',
      sql`${table.recipientCount} >= 0 and ${table.deliveredCount} >= 0 and ${table.deliveredCount} <= ${table.recipientCount}`,
    ),
    check(
      'notification_announcements_cta_check',
      sql`(${table.ctaLabel} is null) = (${table.ctaUrl} is null)`,
    ),
    check(
      'notification_announcements_channels_check',
      sql`jsonb_typeof(${table.channels}) = 'array' and ${table.channels} @> '["in_app"]'::jsonb`,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').references(() => notificationAnnouncements.id, {
      onDelete: 'restrict',
    }),
    mailDeliveryId: uuid('mail_delivery_id'),
    category: varchar('category', { length: 80 }).notNull(),
    level: varchar('level', { length: 20 }).notNull().default('info'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    ctaLabel: varchar('cta_label', { length: 80 }),
    ctaUrl: text('cta_url'),
    sourceType: varchar('source_type', { length: 120 }).notNull(),
    sourceId: varchar('source_id', { length: 200 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    deduplicationHash: char('deduplication_hash', { length: 64 }).notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    emailRequested: boolean('email_requested').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_deduplication_uidx').on(table.deduplicationHash),
    uniqueIndex('notifications_announcement_recipient_uidx')
      .on(table.announcementId, table.recipientUserId)
      .where(sql`${table.announcementId} is not null`),
    index('notifications_recipient_created_idx').on(table.recipientUserId, table.createdAt),
    index('notifications_recipient_unread_idx')
      .on(table.recipientUserId, table.createdAt)
      .where(
        sql`${table.readAt} is null and ${table.archivedAt} is null and ${table.withdrawnAt} is null`,
      ),
    index('notifications_announcement_idx').on(table.announcementId),
    check(
      'notifications_level_check',
      sql`${table.level} in ('info', 'success', 'warning', 'error')`,
    ),
    check('notifications_body_length_check', sql`length(${table.body}) between 1 and 5000`),
    check('notifications_cta_check', sql`(${table.ctaLabel} is null) = (${table.ctaUrl} is null)`),
    check(
      'notifications_mail_binding_check',
      sql`(${table.emailRequested} = false and ${table.mailDeliveryId} is null) or ${table.emailRequested} = true`,
    ),
  ],
);

export const notificationAnnouncementTargets = pgTable(
  'notification_announcement_targets',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => notificationAnnouncements.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => identityUsersForeignKeyTarget.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').references(() => notifications.id, {
      onDelete: 'cascade',
    }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.recipientUserId] }),
    uniqueIndex('notification_announcement_targets_notification_uidx')
      .on(table.notificationId)
      .where(sql`${table.notificationId} is not null`),
    index('notification_announcement_targets_pending_idx').on(table.announcementId, table.status),
    check(
      'notification_announcement_targets_status_check',
      sql`${table.status} in ('pending', 'delivered', 'cancelled')`,
    ),
    check(
      'notification_announcement_targets_delivery_check',
      sql`(${table.status} = 'delivered' and ${table.notificationId} is not null and ${table.deliveredAt} is not null) or (${table.status} <> 'delivered' and ${table.notificationId} is null and ${table.deliveredAt} is null)`,
    ),
  ],
);
