import type { z } from 'zod';

import type { DatabaseExecutor } from '../../../database/database.js';

export type JobStorageStatus = 'queued' | 'running' | 'succeeded' | 'dead' | 'cancelled';
export type JobAttemptStorageStatus =
  'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled';

export interface JobFailureSnapshot {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export interface JobDefinition<TPayload = unknown> {
  type: string;
  queue?: string;
  payloadVersion?: number;
  payloadSchema: z.ZodType<TPayload>;
  maxAttempts?: number;
  leaseMs?: number;
  timeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  classifyError?(error: unknown): JobFailureSnapshot;
}

export interface JobHandlerContext {
  jobId: string;
  attemptNumber: number;
  signal: AbortSignal;
}

export interface JobHandlerDefinition<TPayload = unknown> extends JobDefinition<TPayload> {
  handler(payload: TPayload, context: JobHandlerContext): Promise<void>;
}

export interface EnqueueJobInput<TPayload = unknown> {
  type: string;
  payload: TPayload;
  runAt?: Date;
  priority?: number;
  deduplicationKey?: string;
}

export interface EnqueueJobResult {
  id: string;
  deduplicated: boolean;
}

export interface JobQueue {
  enqueue<TPayload>(
    input: EnqueueJobInput<TPayload>,
    executor?: DatabaseExecutor,
  ): Promise<EnqueueJobResult>;
}

export interface RecurringJobDefinition {
  key: string;
  intervalMs: number;
  type: string;
  payload(scheduledAt: Date): unknown;
  priority?: number;
}

export interface DueRecurringJob extends EnqueueJobInput {
  recurringKey: string;
  scheduledAt: Date;
}
