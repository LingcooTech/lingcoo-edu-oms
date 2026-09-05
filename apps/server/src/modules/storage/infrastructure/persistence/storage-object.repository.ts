import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { storageObjects } from './storage.schema.js';

export class StorageObjectRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async insert(input: typeof storageObjects.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(storageObjects)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findByDeduplication(hash: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(storageObjects)
      .where(eq(storageObjects.deduplicationHash, hash))
      .limit(1);
    return record ?? null;
  }

  async find(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(storageObjects)
      .where(eq(storageObjects.id, id))
      .limit(1);
    return record ?? null;
  }

  async lock(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(storageObjects)
      .where(eq(storageObjects.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async versions(assetId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(storageObjects)
      .where(eq(storageObjects.assetId, assetId))
      .orderBy(asc(storageObjects.version));
  }

  async markReady(
    id: string,
    facts: {
      contentType: string;
      extension: string;
      sizeBytes: number;
      checksumSha256: string;
    },
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(storageObjects)
      .set({ ...facts, status: 'ready', readyAt: now, updatedAt: now })
      .where(and(eq(storageObjects.id, id), eq(storageObjects.status, 'pending')))
      .returning();
    return record ?? null;
  }

  async markSuperseded(id: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(storageObjects)
      .set({ status: 'deletion_pending', updatedAt: now })
      .where(and(eq(storageObjects.id, id), eq(storageObjects.status, 'ready')))
      .returning();
    return record ?? null;
  }

  async markManyDeletionPending(ids: string[], now: Date, executor: DatabaseTransaction) {
    if (!ids.length) return [];
    return executor
      .update(storageObjects)
      .set({ status: 'deletion_pending', updatedAt: now })
      .where(
        and(
          inArray(storageObjects.id, ids),
          inArray(storageObjects.status, ['ready', 'superseded', 'failed']),
        ),
      )
      .returning();
  }

  async markDeleted(id: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(storageObjects)
      .set({ status: 'deleted', deletedAt: now, updatedAt: now })
      .where(and(eq(storageObjects.id, id), eq(storageObjects.status, 'deletion_pending')))
      .returning();
    return record ?? null;
  }

  async markFailed(id: string, code: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(storageObjects)
      .set({ status: 'failed', failureCode: code, updatedAt: now })
      .where(and(eq(storageObjects.id, id), eq(storageObjects.status, 'pending')))
      .returning();
    return record ?? null;
  }

  async expiredPending(before: Date, limit: number) {
    return this.database.db
      .select()
      .from(storageObjects)
      .where(and(eq(storageObjects.status, 'pending'), lt(storageObjects.uploadExpiresAt, before)))
      .orderBy(asc(storageObjects.uploadExpiresAt))
      .limit(limit);
  }
}
