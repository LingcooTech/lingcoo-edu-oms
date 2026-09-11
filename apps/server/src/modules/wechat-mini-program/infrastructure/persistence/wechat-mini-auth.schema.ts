import { sql } from 'drizzle-orm';
import { check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const wechatMiniAuthChallenges = pgTable(
  'wechat_mini_auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenDigest: varchar('token_digest', { length: 64 }).notNull(),
    appId: varchar('app_id', { length: 64 }).notNull(),
    openId: varchar('open_id', { length: 256 }).notNull(),
    unionId: varchar('union_id', { length: 256 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('wechat_mini_auth_challenges_token_digest_unique').on(table.tokenDigest),
    index('wechat_mini_auth_challenges_expiry_idx').on(table.expiresAt),
    check('wechat_mini_auth_challenges_token_digest_check', sql`length(${table.tokenDigest}) = 64`),
  ],
);
