import { ApiError } from '@lingcoo-tech/http';
import type {
  OutboxAttempt,
  OutboxError,
  OutboxEventDetail,
  OutboxEventSummary,
  OutboxQuery,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { OutboxDiagnosticsRepository } from '../infrastructure/persistence/outbox-diagnostics.repository.js';
import type { OutboxRepository } from '../infrastructure/persistence/outbox.repository.js';

type DiagnosticRecord = NonNullable<Awaited<ReturnType<OutboxDiagnosticsRepository['findById']>>>;

export interface OutboxActionContext extends AuditContext {
  actorId: string;
}

export class OutboxAdminService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: OutboxRepository,
    private readonly diagnostics: OutboxDiagnosticsRepository,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(query: OutboxQuery) {
    const result = await this.diagnostics.search(query);
    return {
      items: result.items.map((record) => this.toSummary(record)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<OutboxEventDetail> {
    const [record, attempts] = await Promise.all([
      this.diagnostics.findById(id),
      this.diagnostics.attempts(id),
    ]);
    if (!record) throw new ApiError(404, 'OUTBOX_EVENT_NOT_FOUND', 'Outbox Event 不存在');
    return {
      ...this.toSummary(record),
      payloadHash: record.payloadHash,
      payloadSizeBytes: record.payloadSizeBytes,
      lastError: this.toError(record),
      attempts: attempts.map((attempt): OutboxAttempt => ({
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

  async replay(id: string, context: OutboxActionContext) {
    await this.database.transaction(async (transaction) => {
      const record = await this.repository.findForUpdate(id, transaction);
      if (!record) throw new ApiError(404, 'OUTBOX_EVENT_NOT_FOUND', 'Outbox Event 不存在');
      if (record.status !== 'dead') {
        throw new ApiError(409, 'OUTBOX_EVENT_NOT_REPLAYABLE', '只有死信事件可以手动重放');
      }
      if (record.maxAttempts >= 100) {
        throw new ApiError(409, 'OUTBOX_MANUAL_REPLAY_LIMIT', 'Outbox 手动重放预算已达到上限');
      }
      if (!(await this.repository.replay(record, this.clock(), transaction))) {
        throw new ApiError(409, 'OUTBOX_EVENT_STATE_CHANGED', 'Outbox Event 状态已变化');
      }
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'outbox.event.replayed',
          resourceType: 'outbox.event',
          resourceId: record.id,
          metadata: { topic: record.topic, previousAttempts: record.attemptCount },
        },
        transaction,
      );
    });
    return this.get(id);
  }

  private toSummary(record: DiagnosticRecord): OutboxEventSummary {
    return {
      id: record.id,
      topic: record.topic,
      eventVersion: record.eventVersion,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      aggregateVersion: record.aggregateVersion,
      status: record.status,
      availableAt: record.availableAt.toISOString(),
      attemptCount: record.attemptCount,
      maxAttempts: record.maxAttempts,
      recoveryCount: record.recoveryCount,
      manualReplayCount: record.manualReplayCount,
      deduplicationPreview: record.deduplicationPreview,
      leaseExpiresAt: record.leaseExpiresAt?.toISOString() ?? null,
      occurredAt: record.occurredAt.toISOString(),
      publishedAt: record.publishedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      canReplay: record.status === 'dead',
    };
  }

  private toError(record: DiagnosticRecord): OutboxError | null {
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
}
