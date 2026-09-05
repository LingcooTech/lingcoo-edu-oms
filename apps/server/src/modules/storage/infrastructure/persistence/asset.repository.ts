import type { AssetQuery } from '@lingcoo-edu-oms/contracts';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { storageAssetReferences, storageAssets, storageObjects } from './storage.schema.js';

export class AssetRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async insert(input: typeof storageAssets.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor.insert(storageAssets).values(input).returning();
    return record;
  }

  async find(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(storageAssets)
      .where(eq(storageAssets.id, id))
      .limit(1);
    return record ?? null;
  }

  async lock(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(storageAssets)
      .where(eq(storageAssets.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async currentObject(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select({ asset: storageAssets, object: storageObjects })
      .from(storageAssets)
      .leftJoin(
        storageObjects,
        and(
          eq(storageObjects.assetId, storageAssets.id),
          eq(storageObjects.version, storageAssets.currentVersion),
        ),
      )
      .where(eq(storageAssets.id, id))
      .limit(1);
    return record ?? null;
  }

  async search(query: AssetQuery) {
    const filters: SQL[] = [isNull(storageAssets.deletedAt)];
    if (query.status) filters.push(eq(storageAssets.status, query.status));
    if (query.visibility) filters.push(eq(storageAssets.visibility, query.visibility));
    if (query.mediaKind) filters.push(eq(storageAssets.mediaKind, query.mediaKind));
    if (query.provider) filters.push(eq(storageObjects.provider, query.provider));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const filter = or(
        ilike(storageAssets.displayName, pattern),
        ilike(storageObjects.originalName, pattern),
      );
      if (filter) filters.push(filter);
    }
    const where = and(...filters);
    const selection = {
      asset: storageAssets,
      object: storageObjects,
      referenceCount: sql<number>`(
        select count(*)::int from ${storageAssetReferences}
        where ${storageAssetReferences.assetId} = ${storageAssets.id}
      )`,
    };
    const base = this.database.db
      .select(selection)
      .from(storageAssets)
      .leftJoin(
        storageObjects,
        and(
          eq(storageObjects.assetId, storageAssets.id),
          eq(storageObjects.version, storageAssets.currentVersion),
        ),
      )
      .where(where);
    const [items, totals] = await Promise.all([
      base
        .orderBy(desc(storageAssets.createdAt), desc(storageAssets.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db
        .select({ value: count() })
        .from(storageAssets)
        .leftJoin(
          storageObjects,
          and(
            eq(storageObjects.assetId, storageAssets.id),
            eq(storageObjects.version, storageAssets.currentVersion),
          ),
        )
        .where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async reserveReplacement(
    id: string,
    revision: number,
    pendingVersion: number,
    actorId: string,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(storageAssets)
      .set({ pendingVersion, revision: revision + 1, updatedBy: actorId, updatedAt: now })
      .where(
        and(
          eq(storageAssets.id, id),
          eq(storageAssets.status, 'active'),
          eq(storageAssets.revision, revision),
          isNull(storageAssets.pendingVersion),
        ),
      )
      .returning();
    return record ?? null;
  }

  async activate(
    id: string,
    pendingVersion: number,
    mediaKind: 'image' | 'document' | 'text',
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(storageAssets)
      .set({
        status: 'active',
        mediaKind,
        currentVersion: pendingVersion,
        pendingVersion: null,
        revision: sql`${storageAssets.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(storageAssets.id, id),
          eq(storageAssets.pendingVersion, pendingVersion),
          isNull(storageAssets.deletedAt),
        ),
      )
      .returning();
    return record ?? null;
  }

  async failPending(id: string, pendingVersion: number, now: Date, executor: DatabaseTransaction) {
    const asset = await this.lock(id, executor);
    if (!asset || asset.pendingVersion !== pendingVersion) return null;
    const [record] = await executor
      .update(storageAssets)
      .set({
        status: asset.currentVersion === 0 ? 'failed' : 'active',
        pendingVersion: null,
        revision: asset.revision + 1,
        updatedAt: now,
      })
      .where(eq(storageAssets.id, id))
      .returning();
    return record ?? null;
  }

  async updateMetadata(
    id: string,
    revision: number,
    input: {
      displayName: string;
      altText: string | null;
      visibility: 'public' | 'private';
      actorId: string;
    },
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const { actorId, ...changes } = input;
    const [record] = await executor
      .update(storageAssets)
      .set({ ...changes, updatedBy: actorId, revision: revision + 1, updatedAt: now })
      .where(
        and(
          eq(storageAssets.id, id),
          eq(storageAssets.status, 'active'),
          eq(storageAssets.revision, revision),
          isNull(storageAssets.pendingVersion),
        ),
      )
      .returning();
    return record ?? null;
  }

  async referenceCount(id: string, executor: DatabaseExecutor = this.database.db) {
    const [result] = await executor
      .select({ value: count() })
      .from(storageAssetReferences)
      .where(eq(storageAssetReferences.assetId, id));
    return result?.value ?? 0;
  }

  async markDeleted(
    id: string,
    revision: number,
    actorId: string,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(storageAssets)
      .set({
        status: 'deleted',
        pendingVersion: null,
        revision: revision + 1,
        updatedBy: actorId,
        deletedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storageAssets.id, id),
          inArray(storageAssets.status, ['active', 'failed']),
          eq(storageAssets.revision, revision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async setReference(
    input: typeof storageAssetReferences.$inferInsert,
    executor: DatabaseExecutor,
  ) {
    await executor
      .insert(storageAssetReferences)
      .values(input)
      .onConflictDoUpdate({
        target: [
          storageAssetReferences.ownerType,
          storageAssetReferences.ownerId,
          storageAssetReferences.field,
        ],
        set: { assetId: input.assetId, createdBy: input.createdBy, createdAt: new Date() },
      });
  }

  async findReference(
    ownerType: string,
    ownerId: string,
    field: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(storageAssetReferences)
      .where(
        and(
          eq(storageAssetReferences.ownerType, ownerType),
          eq(storageAssetReferences.ownerId, ownerId),
          eq(storageAssetReferences.field, field),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findReferences(
    ownerType: string,
    ownerId: string,
    fields: string[],
    executor: DatabaseExecutor = this.database.db,
  ) {
    if (fields.length === 0) return [];
    return executor
      .select()
      .from(storageAssetReferences)
      .where(
        and(
          eq(storageAssetReferences.ownerType, ownerType),
          eq(storageAssetReferences.ownerId, ownerId),
          inArray(storageAssetReferences.field, fields),
        ),
      );
  }

  async clearReference(
    ownerType: string,
    ownerId: string,
    field: string,
    executor: DatabaseExecutor,
  ) {
    await executor
      .delete(storageAssetReferences)
      .where(
        and(
          eq(storageAssetReferences.ownerType, ownerType),
          eq(storageAssetReferences.ownerId, ownerId),
          eq(storageAssetReferences.field, field),
        ),
      );
  }
}
