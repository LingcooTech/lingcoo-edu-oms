import type { OutboxQuery } from '@lingcoo-edu-oms/contracts';
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';

import type { DatabaseHandle } from '../../../../database/database.js';
import { outboxAttempts, outboxEvents } from './outbox.schema.js';

export const outboxDiagnosticSelection = {
  id: outboxEvents.id,
  topic: outboxEvents.topic,
  eventVersion: outboxEvents.eventVersion,
  aggregateType: outboxEvents.aggregateType,
  aggregateId: outboxEvents.aggregateId,
  aggregateVersion: outboxEvents.aggregateVersion,
  payloadHash: outboxEvents.payloadHash,
  payloadSizeBytes: outboxEvents.payloadSizeBytes,
  status: outboxEvents.status,
  availableAt: outboxEvents.availableAt,
  attemptCount: outboxEvents.attemptCount,
  maxAttempts: outboxEvents.maxAttempts,
  recoveryCount: outboxEvents.recoveryCount,
  manualReplayCount: outboxEvents.manualReplayCount,
  deduplicationPreview: outboxEvents.deduplicationPreview,
  leaseExpiresAt: outboxEvents.leaseExpiresAt,
  lastErrorCode: outboxEvents.lastErrorCode,
  lastErrorMessage: outboxEvents.lastErrorMessage,
  lastErrorStatus: outboxEvents.lastErrorStatus,
  lastErrorRetryable: outboxEvents.lastErrorRetryable,
  occurredAt: outboxEvents.occurredAt,
  publishedAt: outboxEvents.publishedAt,
  createdAt: outboxEvents.createdAt,
  updatedAt: outboxEvents.updatedAt,
};

export class OutboxDiagnosticsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async findById(id: string) {
    const [record] = await this.database.db
      .select(outboxDiagnosticSelection)
      .from(outboxEvents)
      .where(eq(outboxEvents.id, id))
      .limit(1);
    return record ?? null;
  }

  attempts(eventId: string) {
    return this.database.db
      .select({
        id: outboxAttempts.id,
        attemptNumber: outboxAttempts.attemptNumber,
        status: outboxAttempts.status,
        startedAt: outboxAttempts.startedAt,
        heartbeatAt: outboxAttempts.heartbeatAt,
        finishedAt: outboxAttempts.finishedAt,
        errorCode: outboxAttempts.errorCode,
        errorMessage: outboxAttempts.errorMessage,
        errorStatus: outboxAttempts.errorStatus,
        errorRetryable: outboxAttempts.errorRetryable,
      })
      .from(outboxAttempts)
      .where(eq(outboxAttempts.eventId, eventId))
      .orderBy(desc(outboxAttempts.attemptNumber));
  }

  async search(query: OutboxQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(outboxEvents.status, query.status));
    if (query.topic) filters.push(eq(outboxEvents.topic, query.topic));
    if (query.aggregateType) filters.push(eq(outboxEvents.aggregateType, query.aggregateType));
    if (query.from) filters.push(gte(outboxEvents.occurredAt, new Date(query.from)));
    if (query.to) filters.push(lte(outboxEvents.occurredAt, new Date(query.to)));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const search = or(
        ilike(outboxEvents.topic, pattern),
        ilike(outboxEvents.aggregateId, pattern),
        ilike(outboxEvents.deduplicationPreview, pattern),
        ilike(outboxEvents.lastErrorCode, pattern),
      );
      if (search) filters.push(search);
    }
    const where = filters.length ? and(...filters) : undefined;
    const [items, [total]] = await Promise.all([
      this.database.db
        .select(outboxDiagnosticSelection)
        .from(outboxEvents)
        .where(where)
        .orderBy(desc(outboxEvents.occurredAt), desc(outboxEvents.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(outboxEvents).where(where),
    ]);
    return { items, total: total?.value ?? 0 };
  }
}
