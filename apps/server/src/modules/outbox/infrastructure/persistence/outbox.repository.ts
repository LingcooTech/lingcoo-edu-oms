import { and, asc, eq, lte, or, sql } from 'drizzle-orm';

import type { DatabaseTransaction } from '../../../../database/database.js';
import type { OutboxFailureSnapshot } from '../../domain/model.js';
import { outboxAttempts, outboxEvents } from './outbox.schema.js';

export type StoredOutboxEvent = typeof outboxEvents.$inferSelect;

export class OutboxRepository {
  async claim(
    workerId: string,
    limit: number,
    now: Date,
    token: () => string,
    executor: DatabaseTransaction,
  ) {
    const candidates = await executor
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.status, 'pending'),
          lte(outboxEvents.availableAt, now),
          sql`${outboxEvents.attemptCount} < ${outboxEvents.maxAttempts}`,
          sql`(
            ${outboxEvents.aggregateType} is null or not exists (
              select 1 from outbox_events prior
              where prior.aggregate_type = ${outboxEvents.aggregateType}
                and prior.aggregate_id = ${outboxEvents.aggregateId}
                and prior.aggregate_version < ${outboxEvents.aggregateVersion}
                and prior.status <> 'published'
            )
          )`,
        ),
      )
      .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.createdAt), asc(outboxEvents.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    const claimed: StoredOutboxEvent[] = [];
    for (const candidate of candidates) {
      const claimToken = token();
      const attemptNumber = candidate.attemptCount + 1;
      const [record] = await executor
        .update(outboxEvents)
        .set({
          status: 'publishing',
          attemptCount: attemptNumber,
          claimToken,
          workerId,
          leaseExpiresAt: new Date(now.getTime() + candidate.leaseDurationMs),
          heartbeatAt: now,
          executionDeadline: new Date(now.getTime() + candidate.executionTimeoutMs),
          updatedAt: now,
        })
        .where(and(eq(outboxEvents.id, candidate.id), eq(outboxEvents.status, 'pending')))
        .returning();
      if (!record) continue;
      await executor.insert(outboxAttempts).values({
        eventId: record.id,
        attemptNumber,
        claimToken,
        workerId,
        startedAt: now,
        heartbeatAt: now,
      });
      claimed.push(record);
    }
    return claimed;
  }

  async recoverStale(now: Date, limit: number, executor: DatabaseTransaction) {
    const records = await executor
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.status, 'publishing'), lte(outboxEvents.leaseExpiresAt, now)))
      .orderBy(asc(outboxEvents.leaseExpiresAt), asc(outboxEvents.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    const recovered: StoredOutboxEvent[] = [];
    for (const record of records) {
      const failure: OutboxFailureSnapshot = {
        code: 'OUTBOX_LEASE_EXPIRED',
        message: 'Publisher 租约已过期，事件将由其他 Publisher 恢复',
        statusCode: 500,
        retryable: true,
      };
      await this.finishAttempt(record.id, record.claimToken!, 'timed_out', failure, now, executor);
      const dead = record.attemptCount >= record.maxAttempts;
      const [updated] = await executor
        .update(outboxEvents)
        .set({
          status: dead ? 'dead' : 'pending',
          availableAt: dead ? record.availableAt : now,
          claimToken: null,
          workerId: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          executionDeadline: null,
          recoveryCount: sql`${outboxEvents.recoveryCount} + 1`,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
          lastErrorStatus: failure.statusCode,
          lastErrorRetryable: !dead,
          updatedAt: now,
        })
        .where(
          and(
            eq(outboxEvents.id, record.id),
            eq(outboxEvents.status, 'publishing'),
            eq(outboxEvents.claimToken, record.claimToken!),
            lte(outboxEvents.leaseExpiresAt, now),
          ),
        )
        .returning();
      if (updated) recovered.push(updated);
    }
    return recovered;
  }

  async heartbeat(id: string, claimToken: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(outboxEvents)
      .set({
        heartbeatAt: now,
        leaseExpiresAt: sql`${now}::timestamptz + (${outboxEvents.leaseDurationMs} * interval '1 millisecond')`,
        updatedAt: now,
      })
      .where(
        and(
          eq(outboxEvents.id, id),
          eq(outboxEvents.status, 'publishing'),
          eq(outboxEvents.claimToken, claimToken),
          sql`${outboxEvents.executionDeadline} > ${now}`,
        ),
      )
      .returning();
    if (!record) return null;
    await executor
      .update(outboxAttempts)
      .set({ heartbeatAt: now })
      .where(
        and(
          eq(outboxAttempts.eventId, id),
          eq(outboxAttempts.claimToken, claimToken),
          eq(outboxAttempts.status, 'publishing'),
        ),
      );
    return record;
  }

  async findOwnedForUpdate(id: string, claimToken: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.id, id),
          eq(outboxEvents.status, 'publishing'),
          eq(outboxEvents.claimToken, claimToken),
        ),
      )
      .limit(1)
      .for('update');
    return record ?? null;
  }

  async publish(id: string, claimToken: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(outboxEvents)
      .set({
        status: 'published',
        claimToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        executionDeadline: null,
        publishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(outboxEvents.id, id),
          eq(outboxEvents.status, 'publishing'),
          eq(outboxEvents.claimToken, claimToken),
          sql`${outboxEvents.executionDeadline} > ${now}`,
        ),
      )
      .returning();
    if (!record) return null;
    await this.finishAttempt(id, claimToken, 'published', null, now, executor);
    return record;
  }

  async fail(
    record: StoredOutboxEvent,
    claimToken: string,
    failure: OutboxFailureSnapshot,
    nextAvailableAt: Date,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const dead = !failure.retryable || record.attemptCount >= record.maxAttempts;
    const effectiveFailure = dead && failure.retryable ? { ...failure, retryable: false } : failure;
    const [updated] = await executor
      .update(outboxEvents)
      .set({
        status: dead ? 'dead' : 'pending',
        availableAt: dead ? record.availableAt : nextAvailableAt,
        claimToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        executionDeadline: null,
        lastErrorCode: effectiveFailure.code,
        lastErrorMessage: effectiveFailure.message,
        lastErrorStatus: effectiveFailure.statusCode,
        lastErrorRetryable: effectiveFailure.retryable,
        updatedAt: now,
      })
      .where(
        and(
          eq(outboxEvents.id, record.id),
          eq(outboxEvents.status, 'publishing'),
          eq(outboxEvents.claimToken, claimToken),
        ),
      )
      .returning();
    if (!updated) return null;
    await this.finishAttempt(record.id, claimToken, 'failed', effectiveFailure, now, executor);
    return updated;
  }

  async findForUpdate(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, id))
      .limit(1)
      .for('update');
    return record ?? null;
  }

  async replay(record: StoredOutboxEvent, now: Date, executor: DatabaseTransaction) {
    const [updated] = await executor
      .update(outboxEvents)
      .set({
        status: 'pending',
        availableAt: now,
        maxAttempts: sql`${outboxEvents.maxAttempts} + 1`,
        manualReplayCount: sql`${outboxEvents.manualReplayCount} + 1`,
        updatedAt: now,
      })
      .where(and(eq(outboxEvents.id, record.id), eq(outboxEvents.status, 'dead')))
      .returning();
    return updated ?? null;
  }

  async purgePublished(before: Date, limit: number, executor: DatabaseTransaction) {
    const candidates = await executor
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(and(eq(outboxEvents.status, 'published'), lte(outboxEvents.publishedAt, before)))
      .orderBy(asc(outboxEvents.publishedAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (!candidates.length) return 0;
    const removed = await executor
      .delete(outboxEvents)
      .where(or(...candidates.map((candidate) => eq(outboxEvents.id, candidate.id))))
      .returning({ id: outboxEvents.id });
    return removed.length;
  }

  private async finishAttempt(
    eventId: string,
    claimToken: string,
    status: 'published' | 'failed' | 'timed_out',
    failure: OutboxFailureSnapshot | null,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    await executor
      .update(outboxAttempts)
      .set({
        status,
        finishedAt: now,
        errorCode: failure?.code ?? null,
        errorMessage: failure?.message ?? null,
        errorStatus: failure?.statusCode ?? null,
        errorRetryable: failure?.retryable ?? null,
      })
      .where(
        and(
          eq(outboxAttempts.eventId, eventId),
          eq(outboxAttempts.claimToken, claimToken),
          eq(outboxAttempts.status, 'publishing'),
        ),
      );
  }
}
