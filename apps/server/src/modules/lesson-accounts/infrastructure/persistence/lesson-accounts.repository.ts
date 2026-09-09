import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { LessonBatchListQuery, LessonMovementListQuery } from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  lessonAccounts,
  lessonBatches,
  lessonMovementAllocations,
  lessonMovements,
} from './lesson-accounts.schema.js';

export type LessonAccountRecord = typeof lessonAccounts.$inferSelect;
export type LessonBatchRecord = typeof lessonBatches.$inferSelect;
export type LessonMovementRecord = typeof lessonMovements.$inferSelect;
export type LessonMovementAllocationRecord = typeof lessonMovementAllocations.$inferSelect;

export class LessonAccountsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async findAccount(
    institutionId: string,
    studentId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(lessonAccounts)
      .where(
        and(
          eq(lessonAccounts.institutionId, institutionId),
          eq(lessonAccounts.studentId, studentId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async activeBatchCount(accountId: string, executor: DatabaseExecutor = this.database.db) {
    const [result] = await executor
      .select({ value: count() })
      .from(lessonBatches)
      .where(and(eq(lessonBatches.accountId, accountId), eq(lessonBatches.status, 'available')));
    return result?.value ?? 0;
  }

  async lockOrCreateAccount(
    institutionId: string,
    studentId: string,
    executor: DatabaseTransaction,
  ) {
    const [created] = await executor
      .insert(lessonAccounts)
      .values({ institutionId, studentId })
      .onConflictDoNothing({
        target: [lessonAccounts.studentId, lessonAccounts.institutionId],
      })
      .returning();
    const [record] = await executor
      .select()
      .from(lessonAccounts)
      .where(
        and(
          eq(lessonAccounts.institutionId, institutionId),
          eq(lessonAccounts.studentId, studentId),
        ),
      )
      .for('update')
      .limit(1);
    if (!record) throw new Error('Failed to create or lock lesson account');
    return { record, created: Boolean(created) };
  }

  async updateAccount(
    account: LessonAccountRecord,
    direction: 'credit' | 'debit',
    units: number,
    executor: DatabaseTransaction,
  ) {
    const balanceUnits =
      direction === 'credit' ? account.balanceUnits + units : account.balanceUnits - units;
    const [record] = await executor
      .update(lessonAccounts)
      .set({
        balanceUnits,
        lifetimeCreditedUnits:
          direction === 'credit'
            ? account.lifetimeCreditedUnits + units
            : account.lifetimeCreditedUnits,
        lifetimeDebitedUnits:
          direction === 'debit'
            ? account.lifetimeDebitedUnits + units
            : account.lifetimeDebitedUnits,
        lastSequence: account.lastSequence + 1,
        revision: account.revision + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(lessonAccounts.id, account.id), eq(lessonAccounts.revision, account.revision)))
      .returning();
    return record ?? null;
  }

  async createBatch(input: typeof lessonBatches.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor.insert(lessonBatches).values(input).returning();
    return record!;
  }

  async findBatchForUpdate(accountId: string, batchId: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(lessonBatches)
      .where(and(eq(lessonBatches.id, batchId), eq(lessonBatches.accountId, accountId)))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async lockAvailableBatches(accountId: string, executor: DatabaseTransaction) {
    return executor
      .select()
      .from(lessonBatches)
      .where(and(eq(lessonBatches.accountId, accountId), eq(lessonBatches.status, 'available')))
      .orderBy(asc(lessonBatches.grantedAt), asc(lessonBatches.id))
      .for('update');
  }

  async withdrawFromBatch(
    batch: LessonBatchRecord,
    units: number,
    status: LessonBatchRecord['status'],
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonBatches)
      .set({
        withdrawnUnits: batch.withdrawnUnits + units,
        remainingUnits: batch.remainingUnits - units,
        status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(lessonBatches.id, batch.id), eq(lessonBatches.remainingUnits, batch.remainingUnits)),
      )
      .returning();
    return record ?? null;
  }

  async consumeFromBatch(
    batch: LessonBatchRecord,
    units: number,
    status: LessonBatchRecord['status'],
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonBatches)
      .set({
        consumedUnits: batch.consumedUnits + units,
        remainingUnits: batch.remainingUnits - units,
        status,
        updatedAt: new Date(),
      })
      .where(
        and(eq(lessonBatches.id, batch.id), eq(lessonBatches.remainingUnits, batch.remainingUnits)),
      )
      .returning();
    return record ?? null;
  }

  async restoreConsumedBatch(
    batch: LessonBatchRecord,
    units: number,
    executor: DatabaseTransaction,
  ) {
    if (batch.consumedUnits < units) return null;
    const [record] = await executor
      .update(lessonBatches)
      .set({
        consumedUnits: batch.consumedUnits - units,
        remainingUnits: batch.remainingUnits + units,
        status: 'available',
        updatedAt: new Date(),
      })
      .where(
        and(eq(lessonBatches.id, batch.id), eq(lessonBatches.consumedUnits, batch.consumedUnits)),
      )
      .returning();
    return record ?? null;
  }

  async insertMovement(input: typeof lessonMovements.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor.insert(lessonMovements).values(input).returning();
    return record!;
  }

  async findMovementForUpdate(
    accountId: string,
    movementId: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .select()
      .from(lessonMovements)
      .where(and(eq(lessonMovements.id, movementId), eq(lessonMovements.accountId, accountId)))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async findMovementByRelatedId(
    relatedMovementId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(lessonMovements)
      .where(eq(lessonMovements.relatedMovementId, relatedMovementId))
      .limit(1);
    return record ?? null;
  }

  async listMovementAllocations(movementId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(lessonMovementAllocations)
      .where(eq(lessonMovementAllocations.movementId, movementId))
      .orderBy(asc(lessonMovementAllocations.createdAt), asc(lessonMovementAllocations.batchId));
  }

  async insertAllocations(
    values: (typeof lessonMovementAllocations.$inferInsert)[],
    executor: DatabaseTransaction,
  ) {
    if (values.length === 0) return [];
    return executor.insert(lessonMovementAllocations).values(values).returning();
  }

  async listBatches(institutionId: string, studentId: string, input: LessonBatchListQuery) {
    const account = await this.findAccount(institutionId, studentId);
    if (!account) return { items: [], total: 0 };
    const filters: SQL[] = [eq(lessonBatches.accountId, account.id)];
    if (input.status) filters.push(eq(lessonBatches.status, input.status));
    if (input.sourceType) filters.push(eq(lessonBatches.sourceType, input.sourceType));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(lessonBatches)
        .where(where)
        .orderBy(desc(lessonBatches.grantedAt), desc(lessonBatches.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(lessonBatches).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async listMovements(institutionId: string, studentId: string, input: LessonMovementListQuery) {
    const account = await this.findAccount(institutionId, studentId);
    if (!account) return { items: [], allocations: [], total: 0 };
    const filters: SQL[] = [eq(lessonMovements.accountId, account.id)];
    if (input.type) filters.push(eq(lessonMovements.type, input.type));
    if (input.direction) filters.push(eq(lessonMovements.direction, input.direction));
    if (input.from) filters.push(gte(lessonMovements.occurredAt, new Date(input.from)));
    if (input.to) filters.push(lte(lessonMovements.occurredAt, new Date(input.to)));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(lessonMovements)
        .where(where)
        .orderBy(desc(lessonMovements.sequence))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(lessonMovements).where(where),
    ]);
    const allocations = items.length
      ? await this.database.db
          .select()
          .from(lessonMovementAllocations)
          .where(
            inArray(
              lessonMovementAllocations.movementId,
              items.map((item) => item.id),
            ),
          )
      : [];
    return { items, allocations, total: totals[0]?.value ?? 0 };
  }

  async sumMovements(accountId: string, executor: DatabaseExecutor = this.database.db) {
    const [result] = await executor
      .select({
        credited: sql<number>`coalesce(sum(case when ${lessonMovements.direction} = 'credit' then ${lessonMovements.units} else 0 end), 0)::integer`,
        debited: sql<number>`coalesce(sum(case when ${lessonMovements.direction} = 'debit' then ${lessonMovements.units} else 0 end), 0)::integer`,
      })
      .from(lessonMovements)
      .where(eq(lessonMovements.accountId, accountId));
    return { credited: result?.credited ?? 0, debited: result?.debited ?? 0 };
  }

  isSourceIdentityViolation(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
      const candidate = current as { code?: string; constraint?: string; cause?: unknown };
      if (
        candidate.code === '23505' &&
        candidate.constraint === 'lesson_batches_source_identity_unique'
      ) {
        return true;
      }
      current = candidate.cause;
    }
    return false;
  }
}

export interface DebitAllocation {
  batch: LessonBatchRecord;
  units: number;
}
