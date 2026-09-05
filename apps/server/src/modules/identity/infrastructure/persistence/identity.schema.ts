import { sql } from 'drizzle-orm';
import { check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const identityUsers = pgTable(
  'identity_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    displayName: varchar('display_name', { length: 120 }),
    status: varchar('status', { length: 20 })
      .$type<'active' | 'disabled'>()
      .notNull()
      .default('active'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('identity_users_email_unique').on(table.email),
    check('identity_users_status_check', sql`${table.status} in ('active', 'disabled')`),
    check('identity_users_email_normalized_check', sql`${table.email} = lower(${table.email})`),
  ],
);

export const identityPasswordCredentials = pgTable('identity_password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => identityUsers.id, { onDelete: 'cascade' }),
  passwordHash: varchar('password_hash', { length: 512 }).notNull(),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const identitySessions = pgTable(
  'identity_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    tokenDigest: varchar('token_digest', { length: 64 }).notNull(),
    csrfDigest: varchar('csrf_digest', { length: 64 }).notNull(),
    userAgent: varchar('user_agent', { length: 512 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('identity_sessions_token_digest_unique').on(table.tokenDigest),
    index('identity_sessions_user_active_idx').on(table.userId, table.expiresAt),
  ],
);

export const identityActionTokens = pgTable(
  'identity_action_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsers.id, { onDelete: 'cascade' }),
    purpose: varchar('purpose', { length: 40 })
      .$type<'email_verification' | 'password_reset'>()
      .notNull(),
    tokenDigest: varchar('token_digest', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('identity_action_tokens_digest_unique').on(table.tokenDigest),
    index('identity_action_tokens_user_purpose_idx').on(table.userId, table.purpose),
    check(
      'identity_action_tokens_purpose_check',
      sql`${table.purpose} in ('email_verification', 'password_reset')`,
    ),
  ],
);
