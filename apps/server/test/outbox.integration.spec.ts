import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { createAccessControlService } from '../src/modules/access-control/public.js';
import {
  accessPermissions,
  accessRolePermissions,
  accessRoles,
  accessUserRoles,
} from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import { createAuditService } from '../src/modules/audit/public.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import {
  OutboxEventRegistry,
  OutboxPublisherRegistry,
} from '../src/modules/outbox/application/outbox-publisher.registry.js';
import { OutboxAdminService } from '../src/modules/outbox/application/outbox-admin.service.js';
import { OutboxService } from '../src/modules/outbox/application/outbox.service.js';
import { OutboxConsumerInbox } from '../src/modules/outbox/application/outbox-consumer-inbox.js';
import { OutboxAppendRepository } from '../src/modules/outbox/infrastructure/persistence/outbox-append.repository.js';
import { OutboxDiagnosticsRepository } from '../src/modules/outbox/infrastructure/persistence/outbox-diagnostics.repository.js';
import { OutboxRepository } from '../src/modules/outbox/infrastructure/persistence/outbox.repository.js';
import {
  outboxAttempts,
  outboxConsumerReceipts,
  outboxEvents,
} from '../src/modules/outbox/infrastructure/persistence/outbox.schema.js';
import { systemSettings } from '../src/modules/settings/infrastructure/persistence/settings.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf };
}

suite('outbox PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let now: Date;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookies: ReturnType<typeof cookies>;

  function runtime(
    options: { maxAttempts?: number; auditThrows?: boolean; sensitiveError?: boolean } = {},
  ) {
    const events = new OutboxEventRegistry([
      {
        topic: 'tests.order.changed',
        eventVersion: 1,
        payloadSchema: z.object({ orderId: z.uuid(), state: z.string() }),
        maxAttempts: options.maxAttempts ?? 2,
        leaseMs: 1_000,
        timeoutMs: 5_000,
        backoffBaseMs: 1_000,
        backoffMaxMs: 10_000,
      },
    ]);
    const publishers = new OutboxPublisherRegistry([
      {
        topic: 'tests.order.changed',
        handler: async () => undefined,
        classifyError: options.sensitiveError
          ? () => ({
              code: 'PROVIDER_REJECTED',
              message: 'token=secret-token user@example.com Bearer abc.def.ghi',
              statusCode: 422,
              retryable: false,
            })
          : undefined,
      },
    ]);
    const audit = options.auditThrows
      ? { record: async () => Promise.reject(new Error('audit unavailable')) }
      : createAuditService({ database });
    const repository = new OutboxRepository();
    return {
      outbox: new OutboxService(
        database,
        events,
        publishers,
        new OutboxAppendRepository(),
        repository,
        () => new Date(now),
        randomUUID,
        () => 0.5,
      ),
      admin: new OutboxAdminService(
        database,
        repository,
        new OutboxDiagnosticsRepository(database),
        audit,
        () => new Date(now),
      ),
    };
  }

  function append(outbox: OutboxService, input: Parameters<OutboxService['append']>[0]) {
    return database.transaction((transaction) => outbox.append(input, transaction));
  }

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await database.db.delete(outboxConsumerReceipts);
    await database.db.delete(outboxEvents);
    await database.db.delete(accessUserRoles);
    await database.db.delete(accessRolePermissions);
    await database.db.delete(accessRoles);
    await database.db.delete(accessPermissions);
    await database.db.delete(identityActionTokens);
    await database.db.delete(identitySessions);
    await database.db.delete(identityPasswordCredentials);
    await database.db.delete(identityUsers);
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({ database, identity });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser(
      'outbox-owner@example.com',
      'owner-secure-password',
    );
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'owner-secure-password' },
    });
    ownerCookies = cookies(login.headers['set-cookie']);
  });

  beforeEach(async () => {
    now = new Date('2026-08-31T08:00:00.000Z');
    await database.db.delete(outboxConsumerReceipts);
    await database.db.delete(outboxEvents);
    await database.db.delete(systemSettings);
    await database.db.execute(sql`truncate table ${auditEvents}`);
  });

  afterAll(async () => {
    if (!database) return;
    await database.db.delete(outboxConsumerReceipts);
    await database.db.delete(outboxEvents);
    await database.db.delete(systemSettings);
    await database.db.delete(accessUserRoles);
    await database.db.delete(accessRolePermissions);
    await database.db.delete(accessRoles);
    await database.db.delete(accessPermissions);
    await database.db.delete(identityActionTokens);
    await database.db.delete(identitySessions);
    await database.db.delete(identityPasswordCredentials);
    await database.db.delete(identityUsers);
    await app.close();
  });

  it('atomically appends and deduplicates concurrent events without storing the raw key', async () => {
    const { outbox } = runtime();
    const orderId = randomUUID();
    await expect(
      database.transaction(async (transaction) => {
        await transaction.insert(systemSettings).values({ key: 'outbox.rollback', value: true });
        await outbox.append(
          { topic: 'tests.order.changed', payload: { orderId, state: 'created' } },
          transaction,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await database.db.select().from(outboxEvents)).toHaveLength(0);
    expect(await database.db.select().from(systemSettings)).toHaveLength(0);

    const deduplicationKey = 'orders:private-reference-123';
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        append(outbox, {
          topic: 'tests.order.changed',
          payload: { orderId, state: 'created' },
          deduplicationKey,
        }),
      ),
    );
    expect(new Set(results.map((item) => item.id)).size).toBe(1);
    expect(results.filter((item) => !item.deduplicated)).toHaveLength(1);
    const [stored] = await database.db.select().from(outboxEvents);
    expect(stored?.deduplicationHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(deduplicationKey);
    await expect(
      append(outbox, {
        topic: 'tests.order.changed',
        payload: { orderId, state: 'different' },
        deduplicationKey,
      }),
    ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_IDENTITY_CONFLICT' });
  });

  it('allows one concurrent claim and preserves strict order within an aggregate', async () => {
    const { outbox } = runtime();
    const aggregate = { type: 'order', id: randomUUID() };
    const first = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId: aggregate.id, state: 'created' },
      aggregate: { ...aggregate, version: 1 },
    });
    const second = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId: aggregate.id, state: 'paid' },
      aggregate: { ...aggregate, version: 2 },
    });
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, index) => outbox.claim(`publisher-${index}`, 1)),
    );
    const claimed = claims.flat();
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(first.id);
    expect(await outbox.claim('blocked-by-version-one', 10)).toHaveLength(0);
    await outbox.publish(first.id, claimed[0]!.claimToken!);
    const [next] = await outbox.claim('publisher-next', 10);
    expect(next?.id).toBe(second.id);
  });

  it('rejects cross-conflicts between explicit ID, deduplication key, aggregate version, and occurredAt', async () => {
    const { outbox } = runtime();
    const id = randomUUID();
    const orderId = randomUUID();
    const occurredAt = new Date('2026-08-31T07:59:00.000Z');
    const base = {
      id,
      topic: 'tests.order.changed',
      payload: { orderId, state: 'created' },
      aggregate: { type: 'order', id: orderId, version: 1 },
      occurredAt,
      deduplicationKey: 'orders:identity-one',
    };
    await append(outbox, base);
    await expect(append(outbox, base)).resolves.toMatchObject({ id, deduplicated: true });
    await expect(
      append(outbox, { ...base, occurredAt: new Date(occurredAt.getTime() + 1) }),
    ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_IDENTITY_CONFLICT' });
    await expect(
      append(outbox, { ...base, id: undefined, deduplicationKey: 'orders:identity-two' }),
    ).rejects.toMatchObject({ code: 'OUTBOX_EVENT_IDENTITY_CONFLICT' });
    await expect(append(outbox, { ...base, id: randomUUID() })).rejects.toMatchObject({
      code: 'OUTBOX_EVENT_IDENTITY_CONFLICT',
    });
  });

  it('recovers an expired lease and fences all late writes from the old token', async () => {
    const { outbox, admin } = runtime();
    const event = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId: randomUUID(), state: 'created' },
    });
    const [first] = await outbox.claim('same-worker-id', 1);
    const oldToken = first!.claimToken!;
    now = new Date(now.getTime() + 1_001);
    expect(await outbox.recoverStale()).toHaveLength(1);
    const [second] = await outbox.claim('same-worker-id', 1);
    expect(second?.claimToken).not.toBe(oldToken);
    expect(await outbox.heartbeat(event.id, oldToken)).toBe(false);
    expect(await outbox.publish(event.id, oldToken)).toBe(false);
    expect(await outbox.fail(first!, oldToken, new Error('late'))).toBeNull();
    expect(await outbox.publish(event.id, second!.claimToken!)).toBe(true);
    expect(await admin.get(event.id)).toMatchObject({
      status: 'published',
      attemptCount: 2,
      recoveryCount: 1,
    });
  });

  it('keeps event facts immutable while delivery state and attempts evolve', async () => {
    const { outbox } = runtime({ maxAttempts: 1 });
    const orderId = randomUUID();
    const event = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId, state: 'created' },
      aggregate: { type: 'payment_intent', id: orderId, version: 1 },
    });
    await expect(
      database.db
        .update(outboxEvents)
        .set({ payload: { orderId, state: 'tampered' } })
        .where(eq(outboxEvents.id, event.id)),
    ).rejects.toThrow(/Failed query/);
    const [unchanged] = await database.db
      .select({ payload: outboxEvents.payload })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id));
    expect(unchanged?.payload).toEqual({ orderId, state: 'created' });
    const [claimed] = await outbox.claim('publisher-dead', 1);
    const dead = await outbox.fail(claimed!, claimed!.claimToken!, new Error('provider failed'));
    expect(dead).toMatchObject({ status: 'dead', lastErrorRetryable: false });
    expect(await database.db.select().from(outboxAttempts)).toHaveLength(1);
  });

  it('rejects late publication at the database deadline and redacts classified provider errors', async () => {
    const { outbox, admin } = runtime({ sensitiveError: true });
    const event = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId: randomUUID(), state: 'created' },
    });
    const [claimed] = await outbox.claim('publisher-late', 1);
    now = new Date(now.getTime() + 5_001);
    expect(await outbox.publish(event.id, claimed!.claimToken!)).toBe(false);
    await outbox.fail(claimed!, claimed!.claimToken!, new Error('raw provider response'));
    const detail = await admin.get(event.id);
    expect(detail.lastError?.message).toContain('[redacted]');
    expect(detail.lastError?.message).toContain('[redacted-email]');
    expect(JSON.stringify(detail)).not.toContain('secret-token');
    expect(JSON.stringify(detail)).not.toContain('user@example.com');
    expect(JSON.stringify(detail)).not.toContain('abc.def.ghi');
  });

  it('replays only dead events with the same identity and Audit in one transaction', async () => {
    const { outbox, admin } = runtime({ maxAttempts: 1 });
    const event = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId: randomUUID(), state: 'created' },
    });
    const [claimed] = await outbox.claim('publisher-dead', 1);
    await outbox.fail(claimed!, claimed!.claimToken!, new Error('provider failed'));
    const context = { actorType: 'user' as const, actorId: randomUUID() };
    const replayed = await admin.replay(event.id, context);
    expect(replayed).toMatchObject({
      id: event.id,
      status: 'pending',
      maxAttempts: 2,
      attemptCount: 1,
      manualReplayCount: 1,
    });
    expect(
      await database.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.action, 'outbox.event.replayed')),
    ).toHaveLength(1);

    const failingAudit = runtime({ maxAttempts: 1, auditThrows: true }).admin;
    const [again] = await outbox.claim('publisher-dead-again', 1);
    await outbox.fail(again!, again!.claimToken!, new Error('provider failed again'));
    await expect(failingAudit.replay(event.id, context)).rejects.toThrow('audit unavailable');
    expect((await admin.get(event.id)).status).toBe('dead');
  });

  it('atomically deduplicates concurrent database consumers and rolls receipts back with effects', async () => {
    const eventId = randomUUID();
    const inbox = new OutboxConsumerInbox(database, 'tests.order-projection');
    let executions = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        inbox.consumeOnce(eventId, async (transaction) => {
          executions += 1;
          await transaction.insert(systemSettings).values({
            key: 'outbox.consumer-once',
            value: 'created',
          });
          return 'processed';
        }),
      ),
    );
    expect(executions).toBe(1);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(await database.db.select().from(outboxConsumerReceipts)).toHaveLength(1);

    const rollbackEventId = randomUUID();
    await expect(
      inbox.consumeOnce(rollbackEventId, async (transaction) => {
        await transaction.insert(systemSettings).values({
          key: 'outbox.consumer-rollback',
          value: 'must-rollback',
        });
        throw new Error('consumer failed');
      }),
    ).rejects.toThrow('consumer failed');
    expect(
      await database.db
        .select()
        .from(outboxConsumerReceipts)
        .where(eq(outboxConsumerReceipts.eventId, rollbackEventId)),
    ).toHaveLength(0);
    await expect(inbox.consumeOnce(rollbackEventId, async () => 'retried')).resolves.toMatchObject({
      duplicate: false,
      value: 'retried',
    });

    const secondConsumer = new OutboxConsumerInbox(database, 'tests.analytics-projection');
    await expect(
      secondConsumer.consumeOnce(eventId, async () => 'independent'),
    ).resolves.toMatchObject({ duplicate: false });
  });

  it('enforces API permissions and returns only the safe diagnostic projection', async () => {
    const { outbox } = runtime({ maxAttempts: 1 });
    const rawPayload = 'private-recipient@example.com';
    const event = await append(outbox, {
      topic: 'tests.order.changed',
      payload: { orderId: randomUUID(), state: rawPayload },
      deduplicationKey: 'private:outbox-api-diagnostics-key',
    });
    const [claimed] = await outbox.claim('private-outbox-worker', 1);
    await outbox.fail(claimed!, claimed!.claimToken!, new Error('private provider stack detail'));

    expect((await app.inject({ method: 'GET', url: '/api/outbox/events' })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: `/api/outbox/events/${event.id}`,
      headers: { cookie: ownerCookies.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: event.id,
      status: 'dead',
      payloadSizeBytes: expect.any(Number),
    });
    expect(response.body).not.toContain(rawPayload);
    expect(response.body).not.toContain('private-outbox-worker');
    expect(response.body).not.toContain(claimed!.claimToken!);
    expect(response.body).not.toContain('private provider stack detail');

    const replay = await app.inject({
      method: 'POST',
      url: `/api/outbox/events/${event.id}/actions/replay`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ status: 'pending', manualReplayCount: 1 });
  });
});
