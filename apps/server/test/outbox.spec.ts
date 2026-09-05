import { randomUUID } from 'node:crypto';

import pino from 'pino';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { validateEnvironment } from '../src/config/environment.js';
import {
  OutboxEventRegistry,
  OutboxPublisherRegistry,
} from '../src/modules/outbox/application/outbox-publisher.registry.js';
import { outboxBackoffMilliseconds } from '../src/modules/outbox/domain/backoff.js';
import {
  prepareOutboxDeduplicationKey,
  prepareOutboxPayload,
} from '../src/modules/outbox/domain/event-payload.js';
import type { OutboxService } from '../src/modules/outbox/application/outbox.service.js';
import type { StoredOutboxEvent } from '../src/modules/outbox/infrastructure/persistence/outbox.repository.js';
import { OutboxRunner } from '../src/modules/outbox/workers/outbox-runner.js';

describe('outbox domain', () => {
  it('keeps historical event schemas while selecting the newest version for append', () => {
    const registry = new OutboxEventRegistry([
      {
        topic: 'tests.order.changed',
        eventVersion: 1,
        payloadSchema: z.object({ id: z.string() }),
      },
      {
        topic: 'tests.order.changed',
        eventVersion: 2,
        payloadSchema: z.object({ id: z.string(), state: z.string() }),
      },
    ]);
    expect(registry.require('tests.order.changed').eventVersion).toBe(2);
    expect(registry.get('tests.order.changed', 1)?.eventVersion).toBe(1);
    expect(() =>
      registry.register({
        topic: 'tests.order.changed',
        eventVersion: 1,
        payloadSchema: z.object({ id: z.string() }),
      }),
    ).toThrow('already registered');
  });

  it('allows exactly one publisher per topic', () => {
    const publisher = { topic: 'tests.order.changed', handler: async () => undefined };
    const registry = new OutboxPublisherRegistry([publisher]);
    expect(registry.require(publisher.topic)).toBe(publisher);
    expect(() => registry.register(publisher)).toThrow('already registered');
  });

  it('canonicalizes payloads, protects raw keys, and bounds backoff', () => {
    const schema = z.object({ b: z.number(), a: z.number() });
    expect(prepareOutboxPayload(schema, { a: 1, b: 2 }).hash).toBe(
      prepareOutboxPayload(schema, { b: 2, a: 1 }).hash,
    );
    const rawKey = 'private:event:key-123456';
    expect(JSON.stringify(prepareOutboxDeduplicationKey(rawKey))).not.toContain(rawKey);
    expect(outboxBackoffMilliseconds(2, 1_000, 60_000, () => 0.5)).toBe(2_000);
  });
});

function publishingEvent(): StoredOutboxEvent {
  const current = new Date();
  return {
    id: randomUUID(),
    topic: 'tests.order.changed',
    eventVersion: 1,
    aggregateType: null,
    aggregateId: null,
    aggregateVersion: null,
    payload: { id: 'order-1' },
    payloadHash: 'a'.repeat(64),
    payloadSizeBytes: 16,
    status: 'publishing',
    availableAt: current,
    attemptCount: 1,
    maxAttempts: 2,
    recoveryCount: 0,
    manualReplayCount: 0,
    leaseDurationMs: 1_000,
    executionTimeoutMs: 5_000,
    backoffBaseMs: 1_000,
    backoffMaxMs: 10_000,
    deduplicationHash: null,
    deduplicationPreview: null,
    claimToken: randomUUID(),
    workerId: 'publisher-test',
    leaseExpiresAt: new Date(current.getTime() + 1_000),
    heartbeatAt: current,
    executionDeadline: new Date(current.getTime() + 5_000),
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorStatus: null,
    lastErrorRetryable: null,
    occurredAt: current,
    publishedAt: null,
    createdAt: current,
    updatedAt: current,
  };
}

function runnerHarness(
  event: StoredOutboxEvent,
  handler: (signal: AbortSignal) => Promise<void>,
  heartbeat = vi.fn(async () => true),
) {
  const publish = vi.fn(async () => true);
  const fail = vi.fn(async () => event);
  const service = {
    recoverStale: vi.fn(async () => []),
    purgePublished: vi.fn(async () => 0),
    claim: vi.fn(async () => [event]),
    heartbeat,
    publish,
    fail,
    resolvePublisher: vi.fn(() => ({
      envelope: {
        id: event.id,
        topic: event.topic,
        eventVersion: 1,
        aggregate: null,
        occurredAt: event.occurredAt,
        payload: event.payload,
      },
      publisher: {
        handler: (_event: unknown, context: { signal: AbortSignal }) => handler(context.signal),
      },
    })),
  } as unknown as OutboxService;
  const environment = validateEnvironment({
    ...process.env,
    NODE_ENV: 'test',
    OUTBOX_CONCURRENCY: '1',
    OUTBOX_HEARTBEAT_INTERVAL_MS: '250',
    OUTBOX_MAINTENANCE_INTERVAL_MS: '3600000',
  });
  return {
    runner: new OutboxRunner(environment, service, pino({ level: 'silent' }), 'publisher-test'),
    publish,
    fail,
    heartbeat,
  };
}

describe('outbox runner', () => {
  it('publishes a claimed event with its claim token', async () => {
    const event = publishingEvent();
    const handler = vi.fn(async () => undefined);
    const { runner, publish, fail } = runnerHarness(event, handler);
    await expect(runner.runOnce()).resolves.toBe(1);
    await runner.waitForIdle();
    expect(handler).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(event.id, event.claimToken);
    expect(fail).not.toHaveBeenCalled();
  });

  it('keeps at-least-once recovery semantics when the provider succeeds but completion is not fenced', async () => {
    const event = publishingEvent();
    const handler = vi.fn(async () => undefined);
    const { runner, publish, fail } = runnerHarness(event, handler);
    publish.mockResolvedValue(false);
    await runner.runOnce();
    await runner.waitForIdle();
    expect(handler).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(event.id, event.claimToken);
    expect(fail).not.toHaveBeenCalled();
  });

  it('aborts and schedules a retry when publication times out', async () => {
    const event = publishingEvent();
    event.executionDeadline = new Date(Date.now() + 20);
    const { runner, publish, fail } = runnerHarness(
      event,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    await runner.runOnce();
    await runner.waitForIdle();
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(
      event,
      event.claimToken,
      expect.anything(),
      expect.objectContaining({ code: 'OUTBOX_PUBLISH_TIMED_OUT' }),
    );
  });

  it('aborts without a stale write when heartbeat ownership is uncertain', async () => {
    const event = publishingEvent();
    const heartbeat = vi.fn(async () => Promise.reject(new Error('database unavailable')));
    const { runner, publish, fail } = runnerHarness(
      event,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      heartbeat,
    );
    await runner.runOnce();
    await runner.waitForIdle();
    expect(heartbeat).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
});
