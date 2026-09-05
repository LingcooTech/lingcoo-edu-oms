import type { EncryptedEnvelope } from '@lingcoo-tech/crypto';
import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { identityUsers } from '../../../identity/public.js';

export const systemSettings = pgTable(
  'system_settings',
  {
    key: varchar('key', { length: 120 }).primaryKey(),
    value: jsonb('value_json').$type<unknown>(),
    encryptedValue: jsonb('encrypted_value').$type<EncryptedEnvelope>(),
    encryptionKeyId: varchar('encryption_key_id', { length: 120 }),
    version: integer('version').notNull().default(1),
    updatedBy: uuid('updated_by').references(() => identityUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'system_settings_value_storage_check',
      sql`((${table.value} is not null)::int + (${table.encryptedValue} is not null)::int) = 1`,
    ),
    check(
      'system_settings_encryption_key_check',
      sql`(${table.encryptedValue} is null and ${table.encryptionKeyId} is null) or (${table.encryptedValue} is not null and ${table.encryptionKeyId} is not null)`,
    ),
    check('system_settings_version_check', sql`${table.version} > 0`),
  ],
);
