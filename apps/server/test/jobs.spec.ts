import { randomUUID } from 'node:crypto';

import pino from 'pino';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { validateEnvironment } from '../src/config/environment.js';
import { JobHandlerRegistry } from '../src/modules/jobs/application/job-handler.registry.js';
import type { JobsService } from '../src/modules/jobs/application/jobs.service.js';
import { RecurringJobRegistry } from '../src/modules/jobs/application/recurring-job.registry.js';
import { jobBackoffMilliseconds } from '../src/modules/jobs/domain/backoff.js';
import {
  prepareDeduplicationKey,
  prepareJobPayload,
} from '../src/modules/jobs/domain/job-payload.js';
import type { StoredJob } from '../src/modules/jobs/infrastructure/persistence/jobs.repository.js';
import { JobsRunner } from '../src/modules/jobs/workers/jobs-runner.js';

describe('jobs domain', () => {
  it('canonicalizes payloads and never exposes the raw deduplication key', () => {
    const schema = z.object({
      nested: z.object({ b: z.number(), a: z.number() }),
      name: z.string(),
    });
    const first = prepareJobPayload(schema, { name: 'demo', nested: { a: 1, b: 2 } });
    const second = prepareJobPayload(schema, { nested: { b: 2, a: 1 }, name: 'demo' });
    expect(first).toMatchObject({ payload: { name: 'demo', nested: { a: 1, b: 2 } } });
    expect(first.hash).toBe(second.hash);

    const rawKey = 'customer:order:secret-123456';
    const deduplication = prepareDeduplicationKey(rawKey);
    expect(deduplication.hash).toHaveLength(64);
    expect(JSON.stringify(deduplication)).not.toContain(rawKey);
    expect(deduplication.preview).toMatch(/^cust…/);
  });

  it('rejects unstable or oversized payloads', () => {
    expect(() => prepareJobPayload(z.any(), { when: new Date() })).toThrowError(
      expect.objectContaining({ code: 'JOB_PAYLOAD_INVALID' }),
    );
    expect(() => prepareJobPayload(z.string(), 'x'.repeat(1024 * 1024 + 1))).toThrowError(
      expect.objectContaining({ code: 'JOB_PAYLOAD_TOO_LARGE' }),
    );
  });

  it('bounds exponential backoff and jitter', () => {
    expect(jobBackoffMilliseconds(1, 1_000, 60_000, () => 0)).toBe(800);
    expect(jobBackoffMilliseconds(2, 1_000, 60_000, () => 0.5)).toBe(2_000);
    expect(jobBackoffMilliseconds(20, 1_000, 60_000, () => 1)).toBe(72_000);
  });

  it('validates and uniquely registers handlers', () => {
    const definition = {
      type: 'tests.email.send',
      payloadSchema: z.object({ email: z.email() }),
      handler: async () => undefined,
    };
    const registry = new JobHandlerRegistry([definition]);
    expect(registry.require(definition.type)).toMatchObject({
      queue: 'default',
      payloadVersion: 1,
      maxAttempts: 5,
      leaseMs: 60_000,
    });
    expect(() => registry.register(definition)).toThrow('already registered');
    expect(() =>
      registry.register({
        ...definition,
        type: 'tests.invalid-timeout',
        leaseMs: 2_000,
        timeoutMs: 1_000,
      }),
    ).toThrow('timeout');
  });

  it('creates stable recurring time buckets for cross-worker deduplication', () => {
    const registry = new RecurringJobRegistry([
      {
        key: 'tests.hourly-report',
        type: 'tests.report.generate',
        intervalMs: 60_000,
        payload: (scheduledAt) => ({ scheduledAt: scheduledAt.toISOString() }),
      },
    ]);
    const first = registry.due(new Date('2026-08-31T08:00:10.000Z'))[0];
    const second = registry.due(new Date('2026-08-31T08:00:59.999Z'))[0];
    expect(first).toEqual(second);
    expect(first?.deduplicationKey).toMatch(/^recurring:tests\.hourly-report:/);
    expect(() =>
      registry.register({
        key: 'tests.hourly-report',
        type: 'tests.report.generate',
        intervalMs: 60_000,
        payload: () => ({}),
      }),
    ).toThrow('already registered');
  });
});

function runningJob(): StoredJob {
  const current = new Date();
  return {
    id: randomUUID(),
    type: 'tests.jobs.execute',
    queue: 'default',
    payload: { value: 'runner' },
    payloadHash: 'a'.repeat(64),
    payloadVersion: 1,
    payloadSizeBytes: 18,
    status: 'running',
    priority: 0,
    runAt: current,
    attemptCount: 1,
    maxAttempts: 2,
    recoveryCount: 0,
    manualRetryCount: 0,
    leaseDurationMs: 1_000,
    executionTimeoutMs: 5_000,
    backoffBaseMs: 1_000,
    backoffMaxMs: 10_000,
    deduplicationHash: null,
    deduplicationPreview: null,
    claimToken: randomUUID(),
    workerId: 'worker-test',
    leaseExpiresAt: new Date(current.getTime() + 1_000),
    heartbeatAt: current,
    executionDeadline: new Date(current.getTime() + 5_000),
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorStatus: null,
    lastErrorRetryable: null,
    completedAt: null,
    createdAt: current,
    updatedAt: current,
  };
}

function runnerHarness(
  job: StoredJob,
  handler: (signal: AbortSignal) => Promise<void>,
  heartbeat = vi.fn(async () => true),
) {
  const succeed = vi.fn(async () => true);
  const fail = vi.fn(async () => job);
  const jobs = {
    enqueue: vi.fn(),
    recoverStale: vi.fn(async () => []),
    purgeCompleted: vi.fn(async () => 0),
    claim: vi.fn(async () => [job]),
    heartbeat,
    succeed,
    fail,
    resolveHandler: vi.fn(() => ({
      payload: job.payload,
      definition: {
        handler: (_payload: unknown, context: { signal: AbortSignal }) => handler(context.signal),
      },
    })),
  } as unknown as JobsService;
  const environment = validateEnvironment({
    ...process.env,
    NODE_ENV: 'test',
    JOBS_CONCURRENCY: '1',
    JOBS_HEARTBEAT_INTERVAL_MS: '250',
    JOBS_MAINTENANCE_INTERVAL_MS: '3600000',
  });
  const runner = new JobsRunner(
    environment,
    jobs,
    new RecurringJobRegistry(),
    ['default'],
    pino({ level: 'silent' }),
    'worker-test',
  );
  return { runner, succeed, fail, heartbeat };
}

describe('jobs runner', () => {
  it('executes a claimed handler and commits success with the claim token', async () => {
    const job = runningJob();
    const handler = vi.fn(async () => undefined);
    const { runner, succeed, fail } = runnerHarness(job, handler);
    await expect(runner.runOnce()).resolves.toBe(1);
    await runner.waitForIdle();
    expect(handler).toHaveBeenCalledOnce();
    expect(succeed).toHaveBeenCalledWith(job.id, job.claimToken);
    expect(fail).not.toHaveBeenCalled();
  });

  it('aborts and marks an execution retryable when its deadline expires', async () => {
    const job = runningJob();
    job.executionDeadline = new Date(Date.now() + 20);
    const { runner, succeed, fail } = runnerHarness(
      job,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    await runner.runOnce();
    await runner.waitForIdle();
    expect(succeed).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(
      job,
      job.claimToken,
      expect.anything(),
      expect.objectContaining({ code: 'JOB_EXECUTION_TIMED_OUT', retryable: true }),
    );
  });

  it('aborts without writing completion when heartbeat ownership becomes uncertain', async () => {
    const job = runningJob();
    const heartbeat = vi.fn(async () => Promise.reject(new Error('database unavailable')));
    const { runner, succeed, fail } = runnerHarness(
      job,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      heartbeat,
    );
    await runner.runOnce();
    await runner.waitForIdle();
    expect(heartbeat).toHaveBeenCalled();
    expect(succeed).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
});
