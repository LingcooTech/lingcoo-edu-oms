import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import type {
  AssetMediaKind,
  AssetStatus,
  AssetVisibility,
  StorageObjectStatus,
  StorageProvider,
} from '@lingcoo-edu-oms/contracts';

import { identityUsers } from '../../../identity/public.js';

export const storageAssets = pgTable(
  'storage_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: varchar('status', { length: 20 }).$type<AssetStatus>().notNull().default('uploading'),
    visibility: varchar('visibility', { length: 20 })
      .$type<AssetVisibility>()
      .notNull()
      .default('private'),
    mediaKind: varchar('media_kind', { length: 20 }).$type<AssetMediaKind>(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    altText: varchar('alt_text', { length: 500 }),
    currentVersion: integer('current_version').notNull().default(0),
    pendingVersion: integer('pending_version'),
    revision: integer('revision').notNull().default(1),
    createdBy: uuid('created_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'storage_assets_status_check',
      sql`${table.status} in ('uploading', 'active', 'failed', 'deleted')`,
    ),
    check('storage_assets_visibility_check', sql`${table.visibility} in ('public', 'private')`),
    check(
      'storage_assets_media_kind_check',
      sql`${table.mediaKind} is null or ${table.mediaKind} in ('image', 'document', 'text')`,
    ),
    check(
      'storage_assets_versions_check',
      sql`${table.currentVersion} >= 0 and (${table.pendingVersion} is null or ${table.pendingVersion} > ${table.currentVersion}) and ${table.revision} > 0`,
    ),
    check(
      'storage_assets_state_check',
      sql`(${table.status} = 'uploading' and ${table.currentVersion} = 0 and ${table.pendingVersion} is not null and ${table.deletedAt} is null) or (${table.status} = 'active' and ${table.currentVersion} > 0 and ${table.deletedAt} is null) or (${table.status} = 'failed' and ${table.currentVersion} = 0 and ${table.pendingVersion} is null and ${table.deletedAt} is null) or (${table.status} = 'deleted' and ${table.pendingVersion} is null and ${table.deletedAt} is not null)`,
    ),
    index('storage_assets_status_created_idx').on(table.status, table.createdAt),
    index('storage_assets_visibility_created_idx').on(table.visibility, table.createdAt),
    index('storage_assets_media_kind_created_idx').on(table.mediaKind, table.createdAt),
  ],
);

export const storageObjects = pgTable(
  'storage_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => storageAssets.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    provider: varchar('provider', { length: 20 }).$type<StorageProvider>().notNull(),
    bucket: varchar('bucket', { length: 255 }).notNull(),
    objectKey: text('object_key').notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    declaredContentType: varchar('declared_content_type', { length: 120 }).notNull(),
    declaredSizeBytes: bigint('declared_size_bytes', { mode: 'number' }).notNull(),
    contentType: varchar('content_type', { length: 120 }),
    extension: varchar('extension', { length: 10 }),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    checksumSha256: char('checksum_sha256', { length: 64 }),
    status: varchar('status', { length: 24 })
      .$type<StorageObjectStatus>()
      .notNull()
      .default('pending'),
    uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true }).notNull(),
    deduplicationHash: char('deduplication_hash', { length: 64 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    failureCode: varchar('failure_code', { length: 120 }),
    createdBy: uuid('created_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('storage_objects_asset_version_uidx').on(table.assetId, table.version),
    uniqueIndex('storage_objects_provider_key_uidx').on(
      table.provider,
      table.bucket,
      table.objectKey,
    ),
    uniqueIndex('storage_objects_deduplication_uidx').on(table.deduplicationHash),
    index('storage_objects_status_created_idx').on(table.status, table.createdAt),
    index('storage_objects_asset_created_idx').on(table.assetId, table.createdAt),
    check('storage_objects_version_check', sql`${table.version} > 0`),
    check('storage_objects_provider_check', sql`${table.provider} in ('local', 's3')`),
    check(
      'storage_objects_status_check',
      sql`${table.status} in ('pending', 'stored', 'ready', 'superseded', 'deletion_pending', 'deleted', 'failed')`,
    ),
    check(
      'storage_objects_sizes_check',
      sql`${table.declaredSizeBytes} > 0 and (${table.sizeBytes} is null or ${table.sizeBytes} > 0)`,
    ),
    check(
      'storage_objects_ready_facts_check',
      sql`(${table.status} in ('ready', 'superseded', 'deletion_pending', 'deleted') and ${table.contentType} is not null and ${table.extension} is not null and ${table.sizeBytes} is not null and ${table.checksumSha256} is not null and ${table.readyAt} is not null) or ${table.status} in ('pending', 'stored', 'failed')`,
    ),
    check(
      'storage_objects_deleted_at_check',
      sql`(${table.status} = 'deleted') = (${table.deletedAt} is not null)`,
    ),
  ],
);

export const storageAssetReferences = pgTable(
  'storage_asset_references',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => storageAssets.id, { onDelete: 'restrict' }),
    ownerType: varchar('owner_type', { length: 120 }).notNull(),
    ownerId: varchar('owner_id', { length: 200 }).notNull(),
    field: varchar('field', { length: 120 }).notNull(),
    createdBy: uuid('created_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerType, table.ownerId, table.field] }),
    index('storage_asset_references_asset_idx').on(table.assetId),
    check(
      'storage_asset_references_owner_type_check',
      sql`${table.ownerType} ~ '^[a-z][a-z0-9._-]{0,119}$'`,
    ),
    check(
      'storage_asset_references_field_check',
      sql`${table.field} ~ '^[a-z][a-z0-9._-]{0,119}$'`,
    ),
  ],
);
