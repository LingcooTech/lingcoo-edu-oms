import { jobQueueSchema, jobTypeSchema } from '@lingcoo-edu-oms/contracts';

import type { JobHandlerDefinition } from '../domain/model.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_BACKOFF_BASE_MS = 5_000;
const DEFAULT_BACKOFF_MAX_MS = 60 * 60_000;

export interface ResolvedJobDefinition<TPayload = unknown> extends JobHandlerDefinition<TPayload> {
  type: string;
  queue: string;
  payloadVersion: number;
  maxAttempts: number;
  leaseMs: number;
  timeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export class JobHandlerRegistry {
  private readonly definitions = new Map<string, ResolvedJobDefinition>();

  constructor(definitions: JobHandlerDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register<TPayload>(definition: JobHandlerDefinition<TPayload>): void {
    const resolved = this.resolve(definition);
    if (this.definitions.has(resolved.type)) {
      throw new Error(`Job handler already registered: ${resolved.type}`);
    }
    this.definitions.set(resolved.type, resolved as ResolvedJobDefinition);
  }

  get(type: string): ResolvedJobDefinition | null {
    return this.definitions.get(type) ?? null;
  }

  require(type: string): ResolvedJobDefinition {
    const definition = this.get(jobTypeSchema.parse(type));
    if (!definition) throw new Error(`Job handler is not registered: ${type}`);
    return definition;
  }

  queues(): string[] {
    return [...new Set(['default', ...[...this.definitions.values()].map((item) => item.queue)])];
  }

  private resolve<TPayload>(
    definition: JobHandlerDefinition<TPayload>,
  ): ResolvedJobDefinition<TPayload> {
    const type = jobTypeSchema.parse(definition.type);
    const queue = jobQueueSchema.parse(definition.queue ?? 'default');
    const payloadVersion = definition.payloadVersion ?? 1;
    const maxAttempts = definition.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const leaseMs = definition.leaseMs ?? DEFAULT_LEASE_MS;
    const timeoutMs = definition.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const backoffBaseMs = definition.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    const backoffMaxMs = definition.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
    if (!Number.isInteger(payloadVersion) || payloadVersion < 1 || payloadVersion > 1_000) {
      throw new Error('Job payload version must be between 1 and 1000');
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error('Job max attempts must be between 1 and 20');
    }
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 15 * 60_000) {
      throw new Error('Job lease must be between 1 second and 15 minutes');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < leaseMs || timeoutMs > 24 * 60 * 60_000) {
      throw new Error('Job timeout must be at least one lease and no more than 24 hours');
    }
    if (
      !Number.isInteger(backoffBaseMs) ||
      backoffBaseMs < 100 ||
      !Number.isInteger(backoffMaxMs) ||
      backoffMaxMs < backoffBaseMs ||
      backoffMaxMs > 24 * 60 * 60_000
    ) {
      throw new Error('Job backoff configuration is invalid');
    }
    return {
      ...definition,
      type,
      queue,
      payloadVersion,
      maxAttempts,
      leaseMs,
      timeoutMs,
      backoffBaseMs,
      backoffMaxMs,
    };
  }
}
