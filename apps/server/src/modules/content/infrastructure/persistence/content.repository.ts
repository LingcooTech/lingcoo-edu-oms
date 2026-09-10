import { and, asc, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import type { ContentListQuery, CreateContentRequest } from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { contentItems } from './content.schema.js';

export type ContentRecord = typeof contentItems.$inferSelect;

export class ContentRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async list(input: ContentListQuery) {
    const filters: SQL[] = [];
    if (input.search) filters.push(ilike(contentItems.title, `%${input.search}%`));
    if (input.status) filters.push(eq(contentItems.status, input.status));
    if (input.sourceType) filters.push(eq(contentItems.sourceType, input.sourceType));
    const where = filters.length ? and(...filters) : undefined;
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(contentItems)
        .where(where)
        .orderBy(desc(contentItems.isPinned), desc(contentItems.updatedAt), asc(contentItems.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(contentItems).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async find(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor.select().from(contentItems).where(eq(contentItems.id, id));
    return record ?? null;
  }

  async findBySource(
    sourceType: ContentRecord['sourceType'],
    sourceId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.sourceType, sourceType), eq(contentItems.sourceId, sourceId)));
    return record ?? null;
  }

  async findBySlug(slug: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor.select().from(contentItems).where(eq(contentItems.slug, slug));
    return record ?? null;
  }

  async create(
    input: Omit<CreateContentRequest, 'slug'> & {
      slug: string;
      sourceType: ContentRecord['sourceType'];
      sourceId?: string | null;
      sourceUrl?: string | null;
      importedAt?: Date | null;
      meta?: Record<string, unknown>;
    },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(contentItems)
      .values({
        ...input,
        sourceId: input.sourceId ?? null,
        sourceUrl: input.sourceUrl ?? null,
        importedAt: input.importedAt ?? null,
        meta: input.meta ?? {},
      })
      .returning();
    return record!;
  }

  async update(
    id: string,
    input: Partial<Omit<ContentRecord, 'id' | 'createdAt'>> & { expectedRevision: number },
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(contentItems)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(and(eq(contentItems.id, id), eq(contentItems.revision, expectedRevision)))
      .returning();
    return record ?? null;
  }
}
