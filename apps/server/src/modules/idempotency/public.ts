export { IdempotencyService } from './application/idempotency.service.js';
export type {
  IdempotencyExecutionInput,
  IdempotencyExecutionResult,
  IdempotencyFailureSnapshot,
  IdempotentOperation,
  IdempotentWork,
} from './domain/model.js';
export { createIdempotencyModule, createIdempotencyService } from './plugin.js';
