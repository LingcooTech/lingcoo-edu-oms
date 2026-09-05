import type { IdempotencyQuery } from '@lingcoo-edu-oms/contracts';
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import type { IdempotencyFailureSnapshot, StoredResultEnvelope } from '../../domain/model.js';
import { idempotencyRecords } from './idempotency.schema.js';

export type StoredIdempotencyRecord = typeof idempotencyRecords.$inferSelect;

export interface NewProcessingRecord {
  scope: string;
  operation: string;
  keyHash: string;
  keyPreview: string;
  requestHash: string;
  ownerToken: string;
  maxAttempts: number;
  actorId: string | null;
  lockedUntil: Date;
  expiresAt: Date;
}

const diagnosticSelection = {
  id: idempotencyRecords.id,
  scope: idempotencyRecords.scope,
  operation: idempotencyRecords.operation,
  keyPreview: idempotencyRecords.keyPreview,
  requestHash: idempotencyRecords.requestHash,
  requestHashVersion: idempotencyRecords.requestHashVersion,
  status: idempotencyRecords.status,
  attemptCount: idempotencyRecords.attemptCount,
  maxAttempts: idempotencyRecords.maxAttempts,
  recoveryCount: idempotencyRecords.recoveryCount,
  resultStored: sql<boolean>`${idempotencyRecords.resultEnvelope} is not null`,
  resultSizeBytes: idempotencyRecords.resultSizeBytes,
  lastErrorCode: idempotencyRecords.lastErrorCode,
  lastErrorMessage: idempotencyRecords.lastErrorMessage,
  lastErrorStatus: idempotencyRecords.lastErrorStatus,
  lastErrorRetryable: idempotencyRecords.lastErrorRetryable,
  actorId: idempotencyRecords.actorId,
  lockedUntil: idempotencyRecords.lockedUntil,
  expiresAt: idempotencyRecords.expiresAt,
  completedAt: idempotencyRecords.completedAt,
  createdAt: idempotencyRecords.createdAt,
  updatedAt: idempotencyRecords.updatedAt,
};

export class IdempotencyRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async purgeExpiredCompleted(
    now: Date,
    limit: number,
    executor: DatabaseTransaction,
  ): Promise<number> {
    const candidates = await executor
      .select({ id: idempotencyRecords.id })
      .from(idempotencyRecords)
      .where(
        and(ne(idempotencyRecords.status, 'processing'), lte(idempotencyRecords.expiresAt, now)),
      )
      .limit(limit)
      .for('update', { skipLocked: true });
    if (candidates.length === 0) return 0;
    const removed = await executor
      .delete(idempotencyRecords)
      .where(
        inArray(
          idempotencyRecords.id,
          candidates.map((candidate) => candidate.id),
        ),
      )
      .returning({ id: idempotencyRecords.id });
    return removed.length;
  }

  async insertProcessing(input: NewProcessingRecord, executor: DatabaseExecutor) {
    const [record] = await executor
      .insert(idempotencyRecords)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findByIdentity(
    scope: string,
    operation: string,
    keyHash: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.operation, operation),
          eq(idempotencyRecords.keyHash, keyHash),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findByIdentityForClaim(
    scope: string,
    operation: string,
    keyHash: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.operation, operation),
          eq(idempotencyRecords.keyHash, keyHash),
        ),
      )
      .limit(1)
      .for('update', { skipLocked: true });
    return record ?? null;
  }

  async deleteExpiredCompleted(recordId: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.id, recordId),
          ne(idempotencyRecords.status, 'processing'),
          lte(idempotencyRecords.expiresAt, now),
        ),
      )
      .returning({ id: idempotencyRecords.id });
    return record ?? null;
  }

  async retryFailed(
    recordId: string,
    ownerToken: string,
    actorId: string | null,
    lockedUntil: Date,
    expiresAt: Date,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(idempotencyRecords)
      .set({
        status: 'processing',
        ownerToken,
        actorId,
        lockedUntil,
        expiresAt,
        completedAt: null,
        attemptCount: sql`${idempotencyRecords.attemptCount} + 1`,
        updatedAt: now,
      })
      .where(eq(idempotencyRecords.id, recordId))
      .returning();
    return record ?? null;
  }

  async recoverStale(
    recordId: string,
    ownerToken: string,
    actorId: string | null,
    lockedUntil: Date,
    expiresAt: Date,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(idempotencyRecords)
      .set({
        ownerToken,
        actorId,
        lockedUntil,
        expiresAt,
        attemptCount: sql`${idempotencyRecords.attemptCount} + 1`,
        recoveryCount: sql`${idempotencyRecords.recoveryCount} + 1`,
        lastErrorCode: 'IDEMPOTENCY_ATTEMPT_TIMED_OUT',
        lastErrorMessage: '上一执行租约已过期，当前请求已接管执行',
        lastErrorStatus: 500,
        lastErrorRetryable: true,
        updatedAt: now,
      })
      .where(eq(idempotencyRecords.id, recordId))
      .returning();
    return record ?? null;
  }

  async lockOwned(recordId: string, ownerToken: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.id, recordId),
          eq(idempotencyRecords.status, 'processing'),
          eq(idempotencyRecords.ownerToken, ownerToken),
        ),
      )
      .limit(1)
      .for('update');
    return record ?? null;
  }

  async succeed(
    recordId: string,
    ownerToken: string,
    resultEnvelope: StoredResultEnvelope,
    resultSizeBytes: number,
    expiresAt: Date,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(idempotencyRecords)
      .set({
        status: 'succeeded',
        ownerToken: null,
        lockedUntil: null,
        resultEnvelope,
        resultSizeBytes,
        expiresAt,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(idempotencyRecords.id, recordId),
          eq(idempotencyRecords.status, 'processing'),
          eq(idempotencyRecords.ownerToken, ownerToken),
        ),
      )
      .returning();
    return record ?? null;
  }

  async fail(
    recordId: string,
    ownerToken: string,
    failure: IdempotencyFailureSnapshot,
    expiresAt: Date,
    now: Date,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .update(idempotencyRecords)
      .set({
        status: 'failed',
        ownerToken: null,
        lockedUntil: null,
        resultEnvelope: null,
        resultSizeBytes: null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
        lastErrorStatus: failure.statusCode,
        lastErrorRetryable: failure.retryable,
        expiresAt,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(idempotencyRecords.id, recordId),
          eq(idempotencyRecords.status, 'processing'),
          eq(idempotencyRecords.ownerToken, ownerToken),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findDiagnosticById(id: string) {
    const [record] = await this.database.db
      .select(diagnosticSelection)
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.id, id))
      .limit(1);
    return record ?? null;
  }

  async searchDiagnostics(query: IdempotencyQuery, now: Date) {
    const filters: SQL[] = [];
    if (query.status === 'stale') {
      filters.push(
        eq(idempotencyRecords.status, 'processing'),
        lte(idempotencyRecords.lockedUntil, now),
      );
    } else if (query.status) {
      filters.push(eq(idempotencyRecords.status, query.status));
      if (query.status === 'processing') filters.push(gt(idempotencyRecords.lockedUntil, now));
    }
    if (query.operation) filters.push(eq(idempotencyRecords.operation, query.operation));
    if (query.scope) filters.push(eq(idempotencyRecords.scope, query.scope));
    if (query.from) filters.push(gte(idempotencyRecords.createdAt, new Date(query.from)));
    if (query.to) filters.push(lte(idempotencyRecords.createdAt, new Date(query.to)));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const search = or(
        ilike(idempotencyRecords.keyPreview, pattern),
        ilike(idempotencyRecords.operation, pattern),
        ilike(idempotencyRecords.scope, pattern),
        ilike(idempotencyRecords.lastErrorCode, pattern),
      );
      if (search) filters.push(search);
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    const [items, [total]] = await Promise.all([
      this.database.db
        .select(diagnosticSelection)
        .from(idempotencyRecords)
        .where(where)
        .orderBy(desc(idempotencyRecords.createdAt), desc(idempotencyRecords.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(idempotencyRecords).where(where),
    ]);
    return { items, total: total?.value ?? 0 };
  }
}
