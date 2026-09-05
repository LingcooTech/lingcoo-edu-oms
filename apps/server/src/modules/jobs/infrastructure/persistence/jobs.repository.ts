import type { JobQuery } from '@lingcoo-edu-oms/contracts';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import type { JobFailureSnapshot, JobStorageStatus } from '../../domain/model.js';
import { jobAttempts, jobs } from './jobs.schema.js';

export type StoredJob = typeof jobs.$inferSelect;

export interface NewJobRecord {
  type: string;
  queue: string;
  payload: unknown;
  payloadHash: string;
  payloadVersion: number;
  payloadSizeBytes: number;
  priority: number;
  runAt: Date;
  maxAttempts: number;
  leaseDurationMs: number;
  executionTimeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  deduplicationHash: string | null;
  deduplicationPreview: string | null;
}

const diagnosticSelection = {
  id: jobs.id,
  type: jobs.type,
  queue: jobs.queue,
  payloadHash: jobs.payloadHash,
  payloadVersion: jobs.payloadVersion,
  payloadSizeBytes: jobs.payloadSizeBytes,
  status: jobs.status,
  priority: jobs.priority,
  runAt: jobs.runAt,
  attemptCount: jobs.attemptCount,
  maxAttempts: jobs.maxAttempts,
  recoveryCount: jobs.recoveryCount,
  manualRetryCount: jobs.manualRetryCount,
  deduplicationPreview: jobs.deduplicationPreview,
  leaseExpiresAt: jobs.leaseExpiresAt,
  lastErrorCode: jobs.lastErrorCode,
  lastErrorMessage: jobs.lastErrorMessage,
  lastErrorStatus: jobs.lastErrorStatus,
  lastErrorRetryable: jobs.lastErrorRetryable,
  completedAt: jobs.completedAt,
  createdAt: jobs.createdAt,
  updatedAt: jobs.updatedAt,
};

export class JobsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async insert(input: NewJobRecord, executor: DatabaseExecutor) {
    const [record] = await executor.insert(jobs).values(input).onConflictDoNothing().returning();
    return record ?? null;
  }

  async findByDeduplication(
    type: string,
    hash: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(jobs)
      .where(and(eq(jobs.type, type), eq(jobs.deduplicationHash, hash)))
      .limit(1);
    return record ?? null;
  }

  async recoverStale(now: Date, limit: number, executor: DatabaseTransaction) {
    const records = await executor
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'running'), lte(jobs.leaseExpiresAt, now)))
      .orderBy(asc(jobs.leaseExpiresAt), asc(jobs.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    const recovered: StoredJob[] = [];
    for (const record of records) {
      const failure: JobFailureSnapshot = {
        code: 'JOB_LEASE_EXPIRED',
        message: 'Worker 租约已过期，任务将由其他 Worker 恢复',
        statusCode: 500,
        retryable: true,
      };
      await this.finishAttempt(record.id, record.claimToken!, 'timed_out', failure, now, executor);
      const dead = record.attemptCount >= record.maxAttempts;
      const [updated] = await executor
        .update(jobs)
        .set({
          status: dead ? 'dead' : 'queued',
          runAt: dead ? record.runAt : now,
          claimToken: null,
          workerId: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          executionDeadline: null,
          recoveryCount: sql`${jobs.recoveryCount} + 1`,
          lastErrorCode: failure.code,
          lastErrorMessage: failure.message,
          lastErrorStatus: failure.statusCode,
          lastErrorRetryable: dead ? false : true,
          completedAt: dead ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobs.id, record.id),
            eq(jobs.status, 'running'),
            eq(jobs.claimToken, record.claimToken!),
            lte(jobs.leaseExpiresAt, now),
          ),
        )
        .returning();
      if (updated) recovered.push(updated);
    }
    return recovered;
  }

  async claim(
    queue: string,
    workerId: string,
    limit: number,
    now: Date,
    token: () => string,
    executor: DatabaseTransaction,
  ) {
    const candidates = await executor
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'queued'),
          eq(jobs.queue, queue),
          lte(jobs.runAt, now),
          sql`${jobs.attemptCount} < ${jobs.maxAttempts}`,
        ),
      )
      .orderBy(desc(jobs.priority), asc(jobs.runAt), asc(jobs.createdAt), asc(jobs.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    const claimed: StoredJob[] = [];
    for (const candidate of candidates) {
      const claimToken = token();
      const attemptNumber = candidate.attemptCount + 1;
      const [record] = await executor
        .update(jobs)
        .set({
          status: 'running',
          attemptCount: attemptNumber,
          claimToken,
          workerId,
          leaseExpiresAt: new Date(now.getTime() + candidate.leaseDurationMs),
          heartbeatAt: now,
          executionDeadline: new Date(now.getTime() + candidate.executionTimeoutMs),
          updatedAt: now,
        })
        .where(and(eq(jobs.id, candidate.id), eq(jobs.status, 'queued')))
        .returning();
      if (!record) continue;
      await executor.insert(jobAttempts).values({
        jobId: record.id,
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

  async findOwnedForUpdate(jobId: string, claimToken: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running'), eq(jobs.claimToken, claimToken)))
      .limit(1)
      .for('update');
    return record ?? null;
  }

  async heartbeat(jobId: string, claimToken: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(jobs)
      .set({
        heartbeatAt: now,
        leaseExpiresAt: sql`${now}::timestamptz + (${jobs.leaseDurationMs} * interval '1 millisecond')`,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.status, 'running'),
          eq(jobs.claimToken, claimToken),
          sql`${jobs.executionDeadline} > ${now}`,
        ),
      )
      .returning();
    if (!record) return null;
    await executor
      .update(jobAttempts)
      .set({ heartbeatAt: now })
      .where(
        and(
          eq(jobAttempts.jobId, jobId),
          eq(jobAttempts.claimToken, claimToken),
          eq(jobAttempts.status, 'running'),
        ),
      );
    return record;
  }

  async succeed(jobId: string, claimToken: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(jobs)
      .set({
        status: 'succeeded',
        claimToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        executionDeadline: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.status, 'running'), eq(jobs.claimToken, claimToken)))
      .returning();
    if (!record) return null;
    await this.finishAttempt(jobId, claimToken, 'succeeded', null, now, executor);
    return record;
  }

  async fail(
    record: StoredJob,
    claimToken: string,
    failure: JobFailureSnapshot,
    nextRunAt: Date,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const dead = !failure.retryable || record.attemptCount >= record.maxAttempts;
    const effectiveFailure = dead && failure.retryable ? { ...failure, retryable: false } : failure;
    const [updated] = await executor
      .update(jobs)
      .set({
        status: dead ? 'dead' : 'queued',
        runAt: dead ? record.runAt : nextRunAt,
        claimToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        executionDeadline: null,
        lastErrorCode: effectiveFailure.code,
        lastErrorMessage: effectiveFailure.message,
        lastErrorStatus: effectiveFailure.statusCode,
        lastErrorRetryable: effectiveFailure.retryable,
        completedAt: dead ? now : null,
        updatedAt: now,
      })
      .where(
        and(eq(jobs.id, record.id), eq(jobs.status, 'running'), eq(jobs.claimToken, claimToken)),
      )
      .returning();
    if (!updated) return null;
    await this.finishAttempt(record.id, claimToken, 'failed', effectiveFailure, now, executor);
    return updated;
  }

  async findForUpdate(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1)
      .for('update');
    return record ?? null;
  }

  async retryManually(record: StoredJob, now: Date, executor: DatabaseTransaction) {
    const [updated] = await executor
      .update(jobs)
      .set({
        status: 'queued',
        runAt: now,
        maxAttempts: sql`${jobs.maxAttempts} + 1`,
        manualRetryCount: sql`${jobs.manualRetryCount} + 1`,
        completedAt: null,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, record.id), inArray(jobs.status, ['dead', 'cancelled'])))
      .returning();
    return updated ?? null;
  }

  async cancel(record: StoredJob, now: Date, executor: DatabaseTransaction) {
    if (record.status === 'running') {
      await this.finishAttempt(record.id, record.claimToken!, 'cancelled', null, now, executor);
    }
    const [updated] = await executor
      .update(jobs)
      .set({
        status: 'cancelled',
        claimToken: null,
        workerId: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        executionDeadline: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(eq(jobs.id, record.id), inArray(jobs.status, ['queued', 'running'])))
      .returning();
    return updated ?? null;
  }

  async findDiagnosticById(id: string) {
    const [record] = await this.database.db
      .select(diagnosticSelection)
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);
    return record ?? null;
  }

  async attemptsForDiagnostic(jobId: string) {
    return this.database.db
      .select({
        id: jobAttempts.id,
        attemptNumber: jobAttempts.attemptNumber,
        status: jobAttempts.status,
        startedAt: jobAttempts.startedAt,
        heartbeatAt: jobAttempts.heartbeatAt,
        finishedAt: jobAttempts.finishedAt,
        errorCode: jobAttempts.errorCode,
        errorMessage: jobAttempts.errorMessage,
        errorStatus: jobAttempts.errorStatus,
        errorRetryable: jobAttempts.errorRetryable,
      })
      .from(jobAttempts)
      .where(eq(jobAttempts.jobId, jobId))
      .orderBy(desc(jobAttempts.attemptNumber));
  }

  async searchDiagnostics(query: JobQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(jobs.status, query.status));
    if (query.type) filters.push(eq(jobs.type, query.type));
    if (query.queue) filters.push(eq(jobs.queue, query.queue));
    if (query.from) filters.push(gte(jobs.createdAt, new Date(query.from)));
    if (query.to) filters.push(lte(jobs.createdAt, new Date(query.to)));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const search = or(
        ilike(jobs.type, pattern),
        ilike(jobs.queue, pattern),
        ilike(jobs.deduplicationPreview, pattern),
        ilike(jobs.lastErrorCode, pattern),
      );
      if (search) filters.push(search);
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    const [items, [total]] = await Promise.all([
      this.database.db
        .select(diagnosticSelection)
        .from(jobs)
        .where(where)
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(jobs).where(where),
    ]);
    return { items, total: total?.value ?? 0 };
  }

  async purgeCompleted(before: Date, limit: number, executor: DatabaseTransaction) {
    const candidates = await executor
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.status, ['succeeded', 'dead', 'cancelled']),
          lte(jobs.completedAt, before),
        ),
      )
      .orderBy(asc(jobs.completedAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (candidates.length === 0) return 0;
    const removed = await executor
      .delete(jobs)
      .where(
        inArray(
          jobs.id,
          candidates.map((candidate) => candidate.id),
        ),
      )
      .returning({ id: jobs.id });
    return removed.length;
  }

  private async finishAttempt(
    jobId: string,
    claimToken: string,
    status: 'succeeded' | 'failed' | 'timed_out' | 'cancelled',
    failure: JobFailureSnapshot | null,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    await executor
      .update(jobAttempts)
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
          eq(jobAttempts.jobId, jobId),
          eq(jobAttempts.claimToken, claimToken),
          eq(jobAttempts.status, 'running'),
        ),
      );
  }
}

export type JobDiagnosticRecord = typeof diagnosticSelection;
export type JobTerminalStatus = Extract<JobStorageStatus, 'succeeded' | 'dead' | 'cancelled'>;
