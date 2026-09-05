import type { z } from 'zod';

import type { DatabaseTransaction } from '../../../database/database.js';

export type IdempotencyStorageStatus = 'processing' | 'succeeded' | 'failed';

export interface IdempotencyFailureSnapshot {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export interface IdempotentOperation<TResult> {
  operation: string;
  resultSchema: z.ZodType<TResult>;
  leaseMs?: number;
  retentionMs?: number;
  maxResultBytes?: number;
  maxAttempts?: number;
  classifyError?(error: unknown): IdempotencyFailureSnapshot;
}

export interface IdempotencyExecutionInput {
  scope: string;
  key: string;
  request: unknown;
  actorId?: string | null;
}

export interface IdempotencyExecutionResult<TResult> {
  value: TResult;
  replayed: boolean;
  recordId: string;
  attemptCount: number;
}

export type IdempotentWork<TResult> = (transaction: DatabaseTransaction) => Promise<TResult>;

export interface StoredResultEnvelope {
  value: unknown;
}
