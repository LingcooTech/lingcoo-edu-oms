import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { isoDateTimeSchema } from './common/time.js';

export const contentSourceTypeSchema = z.enum(['manual', 'notion']);
export const contentStatusSchema = z.enum(['draft', 'published', 'archived']);

export const contentItemSchema = z.object({
  id: idSchema,
  slug: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().max(2_000).nullable(),
  contentHtml: z.string().max(200_000),
  coverUrl: z.string().url().max(2_048).nullable(),
  coverThumbUrl: z.string().url().max(2_048).nullable(),
  authorName: z.string().max(120).nullable(),
  sourceType: contentSourceTypeSchema,
  sourceId: z.string().max(255).nullable(),
  sourceUrl: z.string().url().max(2_048).nullable(),
  status: contentStatusSchema,
  isPinned: z.boolean(),
  publishedAt: isoDateTimeSchema.nullable(),
  importedAt: isoDateTimeSchema.nullable(),
  meta: z.record(z.string(), z.unknown()),
  revision: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const contentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(),
  status: contentStatusSchema.optional(),
  sourceType: contentSourceTypeSchema.optional(),
});

export const contentPageSchema = z.object({
  items: z.array(contentItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

const contentFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(160).optional().default(''),
  excerpt: z.string().trim().max(2_000).nullable().optional().default(null),
  contentHtml: z.string().max(200_000).default(''),
  coverUrl: z.string().url().max(2_048).nullable().optional().default(null),
  coverThumbUrl: z.string().url().max(2_048).nullable().optional().default(null),
  authorName: z.string().trim().max(120).nullable().optional().default(null),
  status: contentStatusSchema.default('draft'),
  isPinned: z.boolean().default(false),
});

export const createContentRequestSchema = contentFieldsSchema;
export const updateContentRequestSchema = contentFieldsSchema.partial().extend({
  expectedRevision: z.number().int().positive(),
});
export const importNotionContentRequestSchema = z.object({
  pageIdOrUrl: z.string().trim().min(1).max(2_048),
  status: contentStatusSchema.default('draft'),
});

export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentSourceType = z.infer<typeof contentSourceTypeSchema>;
export type ContentStatus = z.infer<typeof contentStatusSchema>;
export type ContentListQuery = z.infer<typeof contentListQuerySchema>;
export type CreateContentRequest = z.infer<typeof createContentRequestSchema>;
export type UpdateContentRequest = z.infer<typeof updateContentRequestSchema>;
export type ImportNotionContentRequest = z.infer<typeof importNotionContentRequestSchema>;
