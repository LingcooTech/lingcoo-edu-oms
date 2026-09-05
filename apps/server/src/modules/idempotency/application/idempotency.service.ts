import { randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  idempotencyKeySchema,
  idempotencyOperationSchema,
  idempotencyScopeSchema,
  type IdempotencyQuery,
  type IdempotencyRecord,
  type IdempotencyRecordSummary,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle } from '../../../database/database.js';
import type {
  IdempotencyExecutionInput,
  IdempotencyExecutionResult,
  IdempotencyFailureSnapshot,
  IdempotentOperation,
  IdempotentWork,
} from '../domain/model.js';
import {
  hashIdempotencyKey,
  hashIdempotencyRequest,
  previewIdempotencyKey,
} from '../domain/request-hash.js';
import type {
  IdempotencyRepository,
  StoredIdempotencyRecord,
} from '../infrastructure/persistence/idempotency.repository.js';

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_RESULT_BYTES = 256 * 1_024;
const DEFAULT_MAX_ATTEMPTS = 3;
const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 15 * 60 * 1_000;
const MIN_RETENTION_MS = 60_000;
const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_RESULT_BYTES = 1_024 * 1_024;
const MAX_ATTEMPTS = 20;

interface ResolvedOperation<TResult> {
  definition: IdempotentOperation<TResult>;
  operation: string;
  leaseMs: number;
  retentionMs: number;
  maxResultBytes: number;
  maxAttempts: number;
}

type ClaimOutcome<TResult> =
  | { kind: 'acquired'; record: StoredIdempotencyRecord; ownerToken: string }
  | { kind: 'replay'; record: StoredIdempotencyRecord; value: TResult }
  | { kind: 'conflict'; record: StoredIdempotencyRecord }
  | { kind: 'in-progress'; record: StoredIdempotencyRecord }
  | { kind: 'failed'; record: StoredIdempotencyRecord };

type DiagnosticRecord = NonNullable<
  Awaited<ReturnType<IdempotencyRepository['findDiagnosticById']>>
>;

export class IdempotencyService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: IdempotencyRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly ownerToken: () => string = randomUUID,
  ) {}

  async execute<TResult>(
    definition: IdempotentOperation<TResult>,
    input: IdempotencyExecutionInput,
    work: IdempotentWork<TResult>,
  ): Promise<IdempotencyExecutionResult<TResult>> {
    const operation = this.resolveOperation(definition);
    const scope = idempotencyScopeSchema.parse(input.scope);
    const key = idempotencyKeySchema.parse(input.key);
    const requestHash = hashIdempotencyRequest(input.request);
    const keyHash = hashIdempotencyKey(key);
    const claim = await this.claim(operation, {
      scope,
      keyHash,
      keyPreview: previewIdempotencyKey(key),
      requestHash,
      actorId: input.actorId ?? null,
    });

    if (claim.kind === 'conflict') {
      throw new ApiError(
        409,
        'IDEMPOTENCY_KEY_CONFLICT',
        '同一幂等键已用于不同请求，请使用新的幂等键',
        { recordId: claim.record.id },
      );
    }
    if (claim.kind === 'in-progress') {
      const now = this.clock();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((claim.record.lockedUntil?.getTime() ?? now.getTime()) - now.getTime()) / 1_000),
      );
      throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', '相同请求正在处理中，请稍后重试', {
        recordId: claim.record.id,
        retryAfterSeconds,
      });
    }
    if (claim.kind === 'failed') this.throwStoredFailure(claim.record);
    if (claim.kind === 'replay') {
      return {
        value: claim.value,
        replayed: true,
        recordId: claim.record.id,
        attemptCount: claim.record.attemptCount,
      };
    }

    return this.executeOwned(operation, claim.record, claim.ownerToken, work);
  }

  async list(query: IdempotencyQuery) {
    const now = this.clock();
    const result = await this.repository.searchDiagnostics(query, now);
    return {
      items: result.items.map((record) => this.toSummary(record, now)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<IdempotencyRecord> {
    const record = await this.repository.findDiagnosticById(id);
    if (!record) throw new ApiError(404, 'IDEMPOTENCY_RECORD_NOT_FOUND', '幂等记录不存在');
    return this.toDetail(record, this.clock());
  }

  async purgeExpired(limit = 100): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error('Idempotency purge limit must be between 1 and 1000');
    }
    return this.database.transaction((transaction) =>
      this.repository.purgeExpiredCompleted(this.clock(), limit, transaction),
    );
  }

  private async claim<TResult>(
    operation: ResolvedOperation<TResult>,
    input: {
      scope: string;
      keyHash: string;
      keyPreview: string;
      requestHash: string;
      actorId: string | null;
    },
  ): Promise<ClaimOutcome<TResult>> {
    return this.database.transaction(async (transaction) => {
      const now = this.clock();
      await this.repository.purgeExpiredCompleted(now, 25, transaction);
      const ownerToken = this.ownerToken();
      const dates = this.claimDates(now, operation);
      const inserted = await this.repository.insertProcessing(
        {
          ...input,
          operation: operation.operation,
          ownerToken,
          maxAttempts: operation.maxAttempts,
          ...dates,
        },
        transaction,
      );
      if (inserted) return { kind: 'acquired', record: inserted, ownerToken };

      const record = await this.repository.findByIdentityForClaim(
        input.scope,
        operation.operation,
        input.keyHash,
        transaction,
      );
      if (!record) {
        const current = await this.repository.findByIdentity(
          input.scope,
          operation.operation,
          input.keyHash,
          transaction,
        );
        if (!current) {
          throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', '幂等执行权正在变化，请稍后重试');
        }
        return this.readLockedOutcome(operation, current, input.requestHash, now);
      }

      if (record.status !== 'processing' && record.expiresAt.getTime() <= now.getTime()) {
        const removed = await this.repository.deleteExpiredCompleted(record.id, now, transaction);
        if (!removed) {
          throw new ApiError(409, 'IDEMPOTENCY_IN_PROGRESS', '过期幂等记录正在释放，请稍后重试');
        }
        const replacement = await this.repository.insertProcessing(
          {
            ...input,
            operation: operation.operation,
            ownerToken,
            maxAttempts: operation.maxAttempts,
            ...dates,
          },
          transaction,
        );
        if (!replacement) throw new Error('Failed to replace expired idempotency record');
        return { kind: 'acquired', record: replacement, ownerToken };
      }

      if (record.requestHash !== input.requestHash) return { kind: 'conflict', record };
      if (record.status === 'succeeded') {
        return { kind: 'replay', record, value: this.parseStoredResult(operation, record) };
      }
      if (record.status === 'failed') {
        if (!record.lastErrorRetryable || record.attemptCount >= record.maxAttempts) {
          return { kind: 'failed', record };
        }
        const retried = await this.repository.retryFailed(
          record.id,
          ownerToken,
          input.actorId,
          dates.lockedUntil,
          dates.expiresAt,
          now,
          transaction,
        );
        if (!retried) throw new Error('Failed to retry idempotency record');
        return { kind: 'acquired', record: retried, ownerToken };
      }
      if (record.lockedUntil && record.lockedUntil.getTime() > now.getTime()) {
        return { kind: 'in-progress', record };
      }
      if (record.attemptCount >= record.maxAttempts) {
        const exhausted = await this.repository.fail(
          record.id,
          record.ownerToken!,
          {
            code: 'IDEMPOTENCY_ATTEMPTS_EXHAUSTED',
            message: '幂等操作多次执行超时，已停止自动恢复',
            statusCode: 504,
            retryable: false,
          },
          dates.expiresAt,
          now,
          transaction,
        );
        if (!exhausted) throw new Error('Failed to exhaust stale idempotency record');
        return { kind: 'failed', record: exhausted };
      }
      const recovered = await this.repository.recoverStale(
        record.id,
        ownerToken,
        input.actorId,
        dates.lockedUntil,
        dates.expiresAt,
        now,
        transaction,
      );
      if (!recovered) throw new Error('Failed to recover stale idempotency record');
      return { kind: 'acquired', record: recovered, ownerToken };
    });
  }

  private readLockedOutcome<TResult>(
    operation: ResolvedOperation<TResult>,
    record: StoredIdempotencyRecord,
    requestHash: string,
    now: Date,
  ): ClaimOutcome<TResult> {
    if (record.status !== 'processing' && record.expiresAt.getTime() <= now.getTime()) {
      return { kind: 'in-progress', record };
    }
    if (record.requestHash !== requestHash) return { kind: 'conflict', record };
    if (record.status === 'succeeded') {
      return { kind: 'replay', record, value: this.parseStoredResult(operation, record) };
    }
    if (
      record.status === 'failed' &&
      (!record.lastErrorRetryable || record.attemptCount >= record.maxAttempts)
    ) {
      return { kind: 'failed', record };
    }
    if (record.status === 'processing' && record.lockedUntil && record.lockedUntil > now) {
      return { kind: 'in-progress', record };
    }
    return { kind: 'in-progress', record };
  }

  private async executeOwned<TResult>(
    operation: ResolvedOperation<TResult>,
    record: StoredIdempotencyRecord,
    ownerToken: string,
    work: IdempotentWork<TResult>,
  ): Promise<IdempotencyExecutionResult<TResult>> {
    try {
      return await this.database.transaction(async (transaction) => {
        const owned = await this.repository.lockOwned(record.id, ownerToken, transaction);
        if (!owned) {
          throw new ApiError(409, 'IDEMPOTENCY_OWNERSHIP_LOST', '幂等执行权已被其他请求接管');
        }
        const raw = await work(transaction);
        const parsed = operation.definition.resultSchema.safeParse(raw);
        if (!parsed.success) throw new Error('Idempotent operation returned an invalid result');
        let serialized: string;
        try {
          serialized = JSON.stringify({ value: parsed.data });
        } catch {
          throw new Error('Idempotent operation result is not JSON serializable');
        }
        const envelope = JSON.parse(serialized) as { value: unknown };
        const replayable = operation.definition.resultSchema.safeParse(envelope.value);
        if (!replayable.success) {
          throw new Error('Idempotent operation result is not stable after JSON serialization');
        }
        const resultSizeBytes = Buffer.byteLength(serialized, 'utf8');
        if (resultSizeBytes > operation.maxResultBytes) {
          throw new Error('Idempotent operation result exceeds the configured storage limit');
        }
        const now = this.clock();
        const completed = await this.repository.succeed(
          record.id,
          ownerToken,
          envelope,
          resultSizeBytes,
          new Date(now.getTime() + operation.retentionMs),
          now,
          transaction,
        );
        if (!completed) throw new Error('Failed to complete idempotency record');
        return {
          value: replayable.data,
          replayed: false,
          recordId: completed.id,
          attemptCount: completed.attemptCount,
        };
      });
    } catch (error) {
      const now = this.clock();
      await this.repository.fail(
        record.id,
        ownerToken,
        this.classifyFailure(operation.definition, error),
        new Date(now.getTime() + operation.retentionMs),
        now,
      );
      throw error;
    }
  }

  private resolveOperation<TResult>(
    definition: IdempotentOperation<TResult>,
  ): ResolvedOperation<TResult> {
    const operation = idempotencyOperationSchema.parse(definition.operation);
    const leaseMs = definition.leaseMs ?? DEFAULT_LEASE_MS;
    const retentionMs = definition.retentionMs ?? DEFAULT_RETENTION_MS;
    const maxResultBytes = definition.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
    const maxAttempts = definition.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (leaseMs < MIN_LEASE_MS || leaseMs > MAX_LEASE_MS) {
      throw new Error(`Idempotency lease must be between ${MIN_LEASE_MS} and ${MAX_LEASE_MS}ms`);
    }
    if (retentionMs < MIN_RETENTION_MS || retentionMs > MAX_RETENTION_MS) {
      throw new Error(
        `Idempotency retention must be between ${MIN_RETENTION_MS} and ${MAX_RETENTION_MS}ms`,
      );
    }
    if (maxResultBytes < 1 || maxResultBytes > MAX_RESULT_BYTES) {
      throw new Error(`Idempotency result limit must be between 1 and ${MAX_RESULT_BYTES} bytes`);
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS) {
      throw new Error(`Idempotency max attempts must be between 1 and ${MAX_ATTEMPTS}`);
    }
    return { definition, operation, leaseMs, retentionMs, maxResultBytes, maxAttempts };
  }

  private claimDates(now: Date, operation: ResolvedOperation<unknown>) {
    return {
      lockedUntil: new Date(now.getTime() + operation.leaseMs),
      expiresAt: new Date(now.getTime() + operation.retentionMs),
    };
  }

  private parseStoredResult<TResult>(
    operation: ResolvedOperation<TResult>,
    record: StoredIdempotencyRecord,
  ): TResult {
    if (!record.resultEnvelope) {
      throw new ApiError(500, 'IDEMPOTENCY_STORED_RESULT_INVALID', '幂等成功记录缺少结果快照');
    }
    const parsed = operation.definition.resultSchema.safeParse(record.resultEnvelope.value);
    if (!parsed.success) {
      throw new ApiError(500, 'IDEMPOTENCY_STORED_RESULT_INVALID', '幂等结果快照无法通过校验');
    }
    return parsed.data;
  }

  private classifyFailure<TResult>(
    definition: IdempotentOperation<TResult>,
    error: unknown,
  ): IdempotencyFailureSnapshot {
    let candidate: unknown;
    try {
      candidate = definition.classifyError?.(error) ?? this.defaultFailure(error);
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

  private defaultFailure(error: unknown): IdempotencyFailureSnapshot {
    if (error instanceof ApiError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: error.statusCode === 429 || error.statusCode >= 500,
      };
    }
    return {
      code: 'IDEMPOTENCY_EXECUTION_FAILED',
      message: '操作执行失败，可使用同一幂等键重试',
      statusCode: 500,
      retryable: true,
    };
  }

  private throwStoredFailure(record: StoredIdempotencyRecord): never {
    if (record.lastErrorRetryable && record.attemptCount >= record.maxAttempts) {
      throw new ApiError(
        409,
        'IDEMPOTENCY_ATTEMPTS_EXHAUSTED',
        '幂等操作已达到最大尝试次数，不能继续自动执行',
        {
          recordId: record.id,
          replayed: true,
          retryable: false,
          lastErrorCode: record.lastErrorCode,
        },
      );
    }
    throw new ApiError(
      record.lastErrorStatus ?? 500,
      record.lastErrorCode ?? 'IDEMPOTENCY_EXECUTION_FAILED',
      record.lastErrorMessage ?? '幂等操作执行失败',
      { recordId: record.id, replayed: true, retryable: record.lastErrorRetryable ?? false },
    );
  }

  private toSummary(record: DiagnosticRecord, now: Date): IdempotencyRecordSummary {
    return {
      id: record.id,
      scope: record.scope,
      operation: record.operation,
      keyPreview: record.keyPreview,
      status:
        record.status === 'processing' &&
        record.lockedUntil &&
        record.lockedUntil.getTime() <= now.getTime()
          ? 'stale'
          : record.status,
      attemptCount: record.attemptCount,
      maxAttempts: record.maxAttempts,
      recoveryCount: record.recoveryCount,
      actorId: record.actorId,
      lockedUntil: record.lockedUntil?.toISOString() ?? null,
      expiresAt: record.expiresAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }

  private toDetail(record: DiagnosticRecord, now: Date): IdempotencyRecord {
    return {
      ...this.toSummary(record, now),
      requestHash: record.requestHash,
      requestHashVersion: 1,
      resultStored: record.resultStored,
      resultSizeBytes: record.resultSizeBytes,
      lastError:
        record.lastErrorCode &&
        record.lastErrorMessage &&
        record.lastErrorStatus !== null &&
        record.lastErrorRetryable !== null
          ? {
              code: record.lastErrorCode,
              message: record.lastErrorMessage,
              statusCode: record.lastErrorStatus,
              retryable: record.lastErrorRetryable,
            }
          : null,
    };
  }
}
