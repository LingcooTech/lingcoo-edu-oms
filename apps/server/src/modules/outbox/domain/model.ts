import type { z } from 'zod';

import type { DatabaseTransaction } from '../../../database/database.js';

export type OutboxStorageStatus = 'pending' | 'publishing' | 'published' | 'dead';
export type OutboxAttemptStorageStatus = 'publishing' | 'published' | 'failed' | 'timed_out';

export interface OutboxFailureSnapshot {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export interface OutboxAggregateReference {
  type: string;
  id: string;
  version: number;
}

export interface AppendOutboxEvent<TPayload = unknown> {
  id?: string;
  topic: string;
  payload: TPayload;
  aggregate?: OutboxAggregateReference;
  occurredAt?: Date;
  availableAt?: Date;
  deduplicationKey?: string;
}

export interface AppendOutboxResult {
  id: string;
  deduplicated: boolean;
}

export interface OutboxEventEnvelope<TPayload = unknown> {
  id: string;
  topic: string;
  eventVersion: number;
  aggregate: OutboxAggregateReference | null;
  occurredAt: Date;
  payload: TPayload;
}

export interface OutboxPublisherContext {
  eventId: string;
  attemptNumber: number;
  signal: AbortSignal;
}

export interface OutboxEventDefinition<TPayload = unknown> {
  topic: string;
  eventVersion?: number;
  payloadSchema: z.ZodType<TPayload>;
  maxAttempts?: number;
  leaseMs?: number;
  timeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

export interface OutboxPublisherDefinition<TPayload = unknown> {
  topic: string;
  handler(event: OutboxEventEnvelope<TPayload>, context: OutboxPublisherContext): Promise<void>;
  classifyError?(error: unknown): OutboxFailureSnapshot;
}

export interface OutboxPort {
  append<TPayload>(
    input: AppendOutboxEvent<TPayload>,
    executor: DatabaseTransaction,
  ): Promise<AppendOutboxResult>;
}

export interface OutboxConsumerDeduplicationContract {
  readonly consumer: string;
  /**
   * Atomically claims (consumer,eventId), runs the database effect, and commits both.
   * A duplicate must return without invoking work. External effects still need provider idempotency.
   */
  consumeOnce<T>(
    eventId: string,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<{ duplicate: boolean; value?: T }>;
}
