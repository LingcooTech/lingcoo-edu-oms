import { and, eq } from 'drizzle-orm';

import type { DatabaseExecutor, DatabaseTransaction } from '../../../../database/database.js';
import { outboxEvents } from './outbox.schema.js';

export interface NewOutboxEventRecord {
  id?: string;
  topic: string;
  eventVersion: number;
  aggregateType: string | null;
  aggregateId: string | null;
  aggregateVersion: number | null;
  payload: unknown;
  payloadHash: string;
  payloadSizeBytes: number;
  availableAt: Date;
  maxAttempts: number;
  leaseDurationMs: number;
  executionTimeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  deduplicationHash: string | null;
  deduplicationPreview: string | null;
  occurredAt: Date;
}

export class OutboxAppendRepository {
  async insert(input: NewOutboxEventRecord, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(outboxEvents)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findByDeduplication(topic: string, hash: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(outboxEvents)
      .where(and(eq(outboxEvents.topic, topic), eq(outboxEvents.deduplicationHash, hash)))
      .limit(1);
    return record ?? null;
  }

  async findById(id: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, id))
      .limit(1);
    return record ?? null;
  }

  async findByAggregateVersion(
    aggregateType: string,
    aggregateId: string,
    aggregateVersion: number,
    executor: DatabaseExecutor,
  ) {
    const [record] = await executor
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.aggregateType, aggregateType),
          eq(outboxEvents.aggregateId, aggregateId),
          eq(outboxEvents.aggregateVersion, aggregateVersion),
        ),
      )
      .limit(1);
    return record ?? null;
  }
}
