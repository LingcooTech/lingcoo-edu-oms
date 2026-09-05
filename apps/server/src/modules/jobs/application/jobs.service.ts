import { randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import type {
  JobAttempt,
  JobDetail,
  JobError,
  JobQuery,
  JobSummary,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor, DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import { jobBackoffMilliseconds } from '../domain/backoff.js';
import { prepareDeduplicationKey, prepareJobPayload } from '../domain/job-payload.js';
import type {
  EnqueueJobInput,
  EnqueueJobResult,
  JobFailureSnapshot,
  JobQueue,
} from '../domain/model.js';
import type { JobHandlerRegistry, ResolvedJobDefinition } from './job-handler.registry.js';
import type { JobsRepository, StoredJob } from '../infrastructure/persistence/jobs.repository.js';

type DiagnosticRecord = NonNullable<Awaited<ReturnType<JobsRepository['findDiagnosticById']>>>;

export interface JobActionContext extends AuditContext {
  actorId: string;
}

export class JobsService implements JobQueue {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly registry: JobHandlerRegistry,
    private readonly repository: JobsRepository,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
    private readonly claimToken: () => string = randomUUID,
    private readonly random: () => number = Math.random,
  ) {}

  async enqueue<TPayload>(
    input: EnqueueJobInput<TPayload>,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<EnqueueJobResult> {
    const definition = this.registry.require(input.type);
    const prepared = prepareJobPayload(definition.payloadSchema, input.payload);
    const deduplication = prepareDeduplicationKey(input.deduplicationKey);
    const priority = input.priority ?? 0;
    if (!Number.isInteger(priority) || priority < -100 || priority > 100) {
      throw new ApiError(400, 'JOB_PRIORITY_INVALID', 'Job 优先级必须在 -100 到 100 之间');
    }
    const runAt = input.runAt ?? this.clock();
    if (!Number.isFinite(runAt.getTime())) {
      throw new ApiError(400, 'JOB_RUN_AT_INVALID', 'Job 执行时间无效');
    }
    const inserted = await this.repository.insert(
      {
        type: definition.type,
        queue: definition.queue,
        payload: prepared.payload,
        payloadHash: prepared.hash,
        payloadVersion: definition.payloadVersion,
        payloadSizeBytes: prepared.sizeBytes,
        priority,
        runAt,
        maxAttempts: definition.maxAttempts,
        leaseDurationMs: definition.leaseMs,
        executionTimeoutMs: definition.timeoutMs,
        backoffBaseMs: definition.backoffBaseMs,
        backoffMaxMs: definition.backoffMaxMs,
        deduplicationHash: deduplication.hash,
        deduplicationPreview: deduplication.preview,
      },
      executor,
    );
    if (inserted) return { id: inserted.id, deduplicated: false };
    if (!deduplication.hash) throw new Error('Failed to enqueue job without deduplication');
    const existing = await this.repository.findByDeduplication(
      definition.type,
      deduplication.hash,
      executor,
    );
    if (!existing) {
      throw new ApiError(409, 'JOB_ENQUEUE_IN_PROGRESS', 'Job 去重记录正在变化，请稍后重试');
    }
    if (
      existing.payloadHash !== prepared.hash ||
      existing.payloadVersion !== definition.payloadVersion ||
      existing.queue !== definition.queue
    ) {
      throw new ApiError(
        409,
        'JOB_DEDUPLICATION_CONFLICT',
        '同一 Job 去重键已用于不同 Payload 或配置',
        { jobId: existing.id },
      );
    }
    return { id: existing.id, deduplicated: true };
  }

  async recoverStale(limit = 100): Promise<StoredJob[]> {
    this.assertLimit(limit);
    return this.database.transaction((transaction) =>
      this.repository.recoverStale(this.clock(), limit, transaction),
    );
  }

  async claim(queue: string, workerId: string, limit: number): Promise<StoredJob[]> {
    this.assertLimit(limit);
    if (!workerId.trim() || workerId.length > 200) throw new Error('Worker ID is invalid');
    return this.database.transaction((transaction) =>
      this.repository.claim(queue, workerId, limit, this.clock(), this.claimToken, transaction),
    );
  }

  async heartbeat(jobId: string, claimToken: string): Promise<boolean> {
    return this.database.transaction(async (transaction) =>
      Boolean(await this.repository.heartbeat(jobId, claimToken, this.clock(), transaction)),
    );
  }

  async succeed(jobId: string, claimToken: string): Promise<boolean> {
    return this.database.transaction(async (transaction) =>
      Boolean(await this.repository.succeed(jobId, claimToken, this.clock(), transaction)),
    );
  }

  async fail(
    job: StoredJob,
    claimToken: string,
    error: unknown,
    override?: JobFailureSnapshot,
  ): Promise<StoredJob | null> {
    const definition = this.registry.get(job.type);
    const failure = override ?? this.classifyFailure(definition, error);
    const delay = jobBackoffMilliseconds(
      job.attemptCount,
      job.backoffBaseMs,
      job.backoffMaxMs,
      this.random,
    );
    return this.database.transaction(async (transaction) => {
      const owned = await this.repository.findOwnedForUpdate(job.id, claimToken, transaction);
      if (!owned) return null;
      const now = this.clock();
      return this.repository.fail(
        owned,
        claimToken,
        failure,
        new Date(now.getTime() + delay),
        now,
        transaction,
      );
    });
  }

  resolveHandler(job: StoredJob): { definition: ResolvedJobDefinition; payload: unknown } {
    const definition = this.registry.get(job.type);
    if (!definition) {
      throw new ApiError(500, 'JOB_HANDLER_NOT_REGISTERED', 'Job Handler 未注册');
    }
    if (job.payloadVersion !== definition.payloadVersion) {
      throw new ApiError(500, 'JOB_PAYLOAD_VERSION_UNSUPPORTED', 'Job Payload 版本不受支持');
    }
    const parsed = definition.payloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      throw new ApiError(500, 'JOB_STORED_PAYLOAD_INVALID', '持久化 Job Payload 无法通过校验');
    }
    return { definition, payload: parsed.data };
  }

  async list(query: JobQuery) {
    const result = await this.repository.searchDiagnostics(query);
    return {
      items: result.items.map((record) => this.toSummary(record)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<JobDetail> {
    const [record, attempts] = await Promise.all([
      this.repository.findDiagnosticById(id),
      this.repository.attemptsForDiagnostic(id),
    ]);
    if (!record) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job 不存在');
    return {
      ...this.toSummary(record),
      payloadHash: record.payloadHash,
      payloadVersion: record.payloadVersion,
      payloadSizeBytes: record.payloadSizeBytes,
      lastError: this.toError(record),
      attempts: attempts.map((attempt): JobAttempt => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        heartbeatAt: attempt.heartbeatAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
        error:
          attempt.errorCode &&
          attempt.errorMessage &&
          attempt.errorStatus !== null &&
          attempt.errorRetryable !== null
            ? {
                code: attempt.errorCode,
                message: attempt.errorMessage,
                statusCode: attempt.errorStatus,
                retryable: attempt.errorRetryable,
              }
            : null,
      })),
    };
  }

  async retry(id: string, context: JobActionContext): Promise<JobDetail> {
    await this.database.transaction(async (transaction) => {
      const record = await this.repository.findForUpdate(id, transaction);
      if (!record) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job 不存在');
      if (!['dead', 'cancelled'].includes(record.status)) {
        throw new ApiError(409, 'JOB_NOT_RETRYABLE', '只有死信或已取消 Job 可以手动重试');
      }
      if (record.maxAttempts >= 100) {
        throw new ApiError(409, 'JOB_MANUAL_RETRY_LIMIT', 'Job 手动重试预算已达到上限');
      }
      const updated = await this.repository.retryManually(record, this.clock(), transaction);
      if (!updated) throw new ApiError(409, 'JOB_STATE_CHANGED', 'Job 状态已变化');
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'jobs.job.retried',
          resourceType: 'jobs.job',
          resourceId: record.id,
          metadata: { type: record.type, previousStatus: record.status },
        },
        transaction,
      );
    });
    return this.get(id);
  }

  async cancel(id: string, context: JobActionContext): Promise<JobDetail> {
    await this.database.transaction(async (transaction) => {
      const record = await this.repository.findForUpdate(id, transaction);
      if (!record) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job 不存在');
      if (!['queued', 'running'].includes(record.status)) {
        throw new ApiError(409, 'JOB_NOT_CANCELLABLE', '只有排队中或运行中的 Job 可以取消');
      }
      const updated = await this.repository.cancel(record, this.clock(), transaction);
      if (!updated) throw new ApiError(409, 'JOB_STATE_CHANGED', 'Job 状态已变化');
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'jobs.job.cancelled',
          resourceType: 'jobs.job',
          resourceId: record.id,
          metadata: { type: record.type, previousStatus: record.status },
        },
        transaction,
      );
    });
    return this.get(id);
  }

  async purgeCompleted(before: Date, limit = 100): Promise<number> {
    this.assertLimit(limit);
    return this.database.transaction((transaction) =>
      this.repository.purgeCompleted(before, limit, transaction),
    );
  }

  private classifyFailure(
    definition: ResolvedJobDefinition | null,
    error: unknown,
  ): JobFailureSnapshot {
    let candidate: unknown;
    try {
      candidate = definition?.classifyError?.(error) ?? this.defaultFailure(error);
    } catch {
      return this.defaultFailure(error);
    }
    if (typeof candidate !== 'object' || candidate === null) return this.defaultFailure(error);
    const failure = candidate as Record<string, unknown>;
    if (
      typeof failure.code !== 'string' ||
      !/^[A-Z][A-Z0-9_]{2,119}$/.test(failure.code) ||
      typeof failure.message !== 'string' ||
      !failure.message.trim() ||
      failure.message.length > 500 ||
      typeof failure.statusCode !== 'number' ||
      !Number.isInteger(failure.statusCode) ||
      failure.statusCode < 400 ||
      failure.statusCode > 599 ||
      typeof failure.retryable !== 'boolean'
    ) {
      return this.defaultFailure(error);
    }
    return {
      code: failure.code,
      message: failure.message.trim(),
      statusCode: failure.statusCode,
      retryable: failure.retryable,
    };
  }

  private defaultFailure(error: unknown): JobFailureSnapshot {
    if (error instanceof ApiError) {
      const permanentCodes = new Set([
        'JOB_HANDLER_NOT_REGISTERED',
        'JOB_PAYLOAD_VERSION_UNSUPPORTED',
        'JOB_STORED_PAYLOAD_INVALID',
      ]);
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable:
          !permanentCodes.has(error.code) && (error.statusCode === 429 || error.statusCode >= 500),
      };
    }
    return {
      code: 'JOB_EXECUTION_FAILED',
      message: 'Job 执行失败，将按退避策略重试',
      statusCode: 500,
      retryable: true,
    };
  }

  private toSummary(record: DiagnosticRecord): JobSummary {
    return {
      id: record.id,
      type: record.type,
      queue: record.queue,
      status: record.status,
      priority: record.priority,
      runAt: record.runAt.toISOString(),
      attemptCount: record.attemptCount,
      maxAttempts: record.maxAttempts,
      recoveryCount: record.recoveryCount,
      manualRetryCount: record.manualRetryCount,
      deduplicationPreview: record.deduplicationPreview,
      leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      canRetry: record.status === 'dead' || record.status === 'cancelled',
      canCancel: record.status === 'queued' || record.status === 'running',
    };
  }

  private toError(record: DiagnosticRecord): JobError | null {
    return record.lastErrorCode &&
      record.lastErrorMessage &&
      record.lastErrorStatus !== null &&
      record.lastErrorRetryable !== null
      ? {
          code: record.lastErrorCode,
          message: record.lastErrorMessage,
          statusCode: record.lastErrorStatus,
          retryable: record.lastErrorRetryable,
        }
      : null;
  }

  private assertLimit(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error('Job batch limit must be between 1 and 1000');
    }
  }
}
