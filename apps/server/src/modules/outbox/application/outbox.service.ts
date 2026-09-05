import { randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { outboxAggregateTypeSchema } from '@lingcoo-edu-oms/contracts';
import { z } from 'zod';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type {
  AppendOutboxEvent,
  AppendOutboxResult,
  OutboxFailureSnapshot,
  OutboxPort,
} from '../domain/model.js';
import { outboxBackoffMilliseconds } from '../domain/backoff.js';
import { prepareOutboxDeduplicationKey, prepareOutboxPayload } from '../domain/event-payload.js';
import type { OutboxAppendRepository } from '../infrastructure/persistence/outbox-append.repository.js';
import type { OutboxEventRegistry, OutboxPublisherRegistry } from './outbox-publisher.registry.js';
import type {
  OutboxRepository,
  StoredOutboxEvent,
} from '../infrastructure/persistence/outbox.repository.js';

export class OutboxService implements OutboxPort {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly events: OutboxEventRegistry,
    private readonly publishers: OutboxPublisherRegistry,
    private readonly appendRepository: OutboxAppendRepository,
    private readonly repository: OutboxRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly claimToken: () => string = randomUUID,
    private readonly random: () => number = Math.random,
  ) {}

  async append<TPayload>(
    input: AppendOutboxEvent<TPayload>,
    executor: DatabaseTransaction,
  ): Promise<AppendOutboxResult> {
    const definition = this.events.require(input.topic);
    const prepared = prepareOutboxPayload(definition.payloadSchema, input.payload);
    const deduplication = prepareOutboxDeduplicationKey(input.deduplicationKey);
    const id = input.id ? z.uuid().parse(input.id) : undefined;
    const aggregate = input.aggregate
      ? {
          type: outboxAggregateTypeSchema.parse(input.aggregate.type),
          id: z.string().trim().min(1).max(200).parse(input.aggregate.id),
          version: z.number().int().positive().parse(input.aggregate.version),
        }
      : null;
    const now = this.clock();
    const occurredAt = input.occurredAt ?? now;
    const availableAt = input.availableAt ?? now;
    if (!Number.isFinite(occurredAt.getTime()) || !Number.isFinite(availableAt.getTime())) {
      throw new ApiError(400, 'OUTBOX_EVENT_TIME_INVALID', 'Outbox Event 时间无效');
    }
    const inserted = await this.appendRepository.insert(
      {
        id,
        topic: definition.topic,
        eventVersion: definition.eventVersion,
        aggregateType: aggregate?.type ?? null,
        aggregateId: aggregate?.id ?? null,
        aggregateVersion: aggregate?.version ?? null,
        payload: prepared.payload,
        payloadHash: prepared.hash,
        payloadSizeBytes: prepared.sizeBytes,
        availableAt,
        maxAttempts: definition.maxAttempts,
        leaseDurationMs: definition.leaseMs,
        executionTimeoutMs: definition.timeoutMs,
        backoffBaseMs: definition.backoffBaseMs,
        backoffMaxMs: definition.backoffMaxMs,
        deduplicationHash: deduplication.hash,
        deduplicationPreview: deduplication.preview,
        occurredAt,
      },
      executor,
    );
    if (inserted) return { id: inserted.id, deduplicated: false };

    const existing =
      (id ? await this.appendRepository.findById(id, executor) : null) ??
      (deduplication.hash
        ? await this.appendRepository.findByDeduplication(
            definition.topic,
            deduplication.hash,
            executor,
          )
        : null) ??
      (aggregate
        ? await this.appendRepository.findByAggregateVersion(
            aggregate.type,
            aggregate.id,
            aggregate.version,
            executor,
          )
        : null);
    if (!existing) {
      throw new ApiError(409, 'OUTBOX_APPEND_CONFLICT', 'Outbox Event 唯一身份发生冲突');
    }
    if (
      existing.topic !== definition.topic ||
      existing.eventVersion !== definition.eventVersion ||
      existing.payloadHash !== prepared.hash ||
      existing.aggregateType !== (aggregate?.type ?? null) ||
      existing.aggregateId !== (aggregate?.id ?? null) ||
      existing.aggregateVersion !== (aggregate?.version ?? null) ||
      (id !== undefined && existing.id !== id) ||
      existing.deduplicationHash !== deduplication.hash ||
      (input.occurredAt !== undefined && existing.occurredAt.getTime() !== occurredAt.getTime())
    ) {
      throw new ApiError(409, 'OUTBOX_EVENT_IDENTITY_CONFLICT', '相同事件身份已用于不同业务事实', {
        eventId: existing.id,
      });
    }
    return { id: existing.id, deduplicated: true };
  }

  async claim(workerId: string, limit: number) {
    this.assertLimit(limit);
    if (!workerId.trim() || workerId.length > 200)
      throw new Error('Publisher Worker ID is invalid');
    return this.database.transaction((transaction) =>
      this.repository.claim(workerId, limit, this.clock(), this.claimToken, transaction),
    );
  }

  async recoverStale(limit = 100) {
    this.assertLimit(limit);
    return this.database.transaction((transaction) =>
      this.repository.recoverStale(this.clock(), limit, transaction),
    );
  }

  async heartbeat(id: string, token: string) {
    return this.database.transaction(async (transaction) =>
      Boolean(await this.repository.heartbeat(id, token, this.clock(), transaction)),
    );
  }

  async publish(id: string, token: string) {
    return this.database.transaction(async (transaction) =>
      Boolean(await this.repository.publish(id, token, this.clock(), transaction)),
    );
  }

  async fail(
    event: StoredOutboxEvent,
    token: string,
    error: unknown,
    override?: OutboxFailureSnapshot,
  ) {
    const failure = override ?? this.classifyFailure(event.topic, error);
    const delay = outboxBackoffMilliseconds(
      event.attemptCount,
      event.backoffBaseMs,
      event.backoffMaxMs,
      this.random,
    );
    return this.database.transaction(async (transaction) => {
      const owned = await this.repository.findOwnedForUpdate(event.id, token, transaction);
      if (!owned) return null;
      const now = this.clock();
      return this.repository.fail(
        owned,
        token,
        failure,
        new Date(now.getTime() + delay),
        now,
        transaction,
      );
    });
  }

  resolvePublisher(event: StoredOutboxEvent) {
    const definition = this.events.get(event.topic, event.eventVersion);
    if (!definition) throw new ApiError(500, 'OUTBOX_EVENT_NOT_REGISTERED', 'Outbox Event 未注册');
    const payload = definition.payloadSchema.safeParse(event.payload);
    if (!payload.success) {
      throw new ApiError(
        500,
        'OUTBOX_STORED_PAYLOAD_INVALID',
        '持久化 Outbox Payload 无法通过校验',
      );
    }
    const publisher = this.publishers.get(event.topic);
    if (!publisher)
      throw new ApiError(500, 'OUTBOX_PUBLISHER_NOT_REGISTERED', 'Outbox Publisher 未注册');
    return {
      publisher,
      envelope: {
        id: event.id,
        topic: event.topic,
        eventVersion: event.eventVersion,
        aggregate:
          event.aggregateType && event.aggregateId && event.aggregateVersion
            ? { type: event.aggregateType, id: event.aggregateId, version: event.aggregateVersion }
            : null,
        occurredAt: event.occurredAt,
        payload: payload.data,
      },
    };
  }

  async purgePublished(before: Date, limit = 100) {
    this.assertLimit(limit);
    return this.database.transaction((transaction) =>
      this.repository.purgePublished(before, limit, transaction),
    );
  }

  private classifyFailure(topic: string, error: unknown): OutboxFailureSnapshot {
    let candidate: unknown;
    try {
      candidate = this.publishers.get(topic)?.classifyError?.(error) ?? this.defaultFailure(error);
    } catch {
      return this.defaultFailure(error);
    }
    if (!candidate || typeof candidate !== 'object') return this.defaultFailure(error);
    const failure = candidate as Record<string, unknown>;
    if (
      typeof failure.code !== 'string' ||
      !/^[A-Z][A-Z0-9_]{2,119}$/.test(failure.code) ||
      typeof failure.message !== 'string' ||
      !failure.message.trim() ||
      failure.message.length > 500 ||
      !Number.isInteger(failure.statusCode) ||
      (failure.statusCode as number) < 400 ||
      (failure.statusCode as number) > 599 ||
      typeof failure.retryable !== 'boolean'
    )
      return this.defaultFailure(error);
    return {
      code: failure.code,
      message: this.safeMessage(failure.message),
      statusCode: failure.statusCode as number,
      retryable: failure.retryable,
    };
  }

  private defaultFailure(error: unknown): OutboxFailureSnapshot {
    if (error instanceof ApiError) {
      const permanent = new Set([
        'OUTBOX_EVENT_NOT_REGISTERED',
        'OUTBOX_EVENT_VERSION_UNSUPPORTED',
        'OUTBOX_STORED_PAYLOAD_INVALID',
        'OUTBOX_PUBLISHER_NOT_REGISTERED',
      ]);
      return {
        code: error.code,
        message: this.safeMessage(error.message),
        statusCode: error.statusCode,
        retryable:
          !permanent.has(error.code) && (error.statusCode === 429 || error.statusCode >= 500),
      };
    }
    return {
      code: 'OUTBOX_PUBLISH_FAILED',
      message: 'Outbox Event 发布失败，将按退避策略重试',
      statusCode: 500,
      retryable: true,
    };
  }

  private assertLimit(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
      throw new Error('Outbox batch limit must be between 1 and 1000');
  }

  private safeMessage(message: string) {
    return message
      .trim()
      .slice(0, 500)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b(token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  }
}
