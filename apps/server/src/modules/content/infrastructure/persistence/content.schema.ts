import { sql } from 'drizzle-orm';
import {
  boolean,
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

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const contentItems = pgTable(
  'content_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 160 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    excerpt: text('excerpt'),
    contentHtml: text('content_html').notNull().default(''),
    coverUrl: varchar('cover_url', { length: 2_048 }),
    coverThumbUrl: varchar('cover_thumb_url', { length: 2_048 }),
    authorName: varchar('author_name', { length: 120 }),
    sourceType: varchar('source_type', { length: 20 })
      .$type<'manual' | 'notion'>()
      .notNull()
      .default('manual'),
    sourceId: varchar('source_id', { length: 255 }),
    sourceUrl: varchar('source_url', { length: 2_048 }),
    status: varchar('status', { length: 20 })
      .$type<'draft' | 'published' | 'archived'>()
      .notNull()
      .default('draft'),
    isPinned: boolean('is_pinned').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    revision: integer('revision').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('content_items_slug_unique').on(table.slug),
    uniqueIndex('content_items_source_unique')
      .on(table.sourceType, table.sourceId)
      .where(sql`${table.sourceId} is not null`),
    index('content_items_status_published_idx').on(table.status, table.publishedAt),
    index('content_items_source_idx').on(table.sourceType, table.sourceId),
    check('content_items_source_type_check', sql`${table.sourceType} in ('manual','notion')`),
    check('content_items_status_check', sql`${table.status} in ('draft','published','archived')`),
    check('content_items_revision_check', sql`${table.revision} > 0`),
  ],
);
