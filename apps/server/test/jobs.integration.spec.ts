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
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import { JobHandlerRegistry } from '../src/modules/jobs/application/job-handler.registry.js';
import { JobsService } from '../src/modules/jobs/application/jobs.service.js';
import { JobsRepository } from '../src/modules/jobs/infrastructure/persistence/jobs.repository.js';
import { jobAttempts, jobs } from '../src/modules/jobs/infrastructure/persistence/jobs.schema.js';
import { systemSettings } from '../src/modules/settings/infrastructure/persistence/settings.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
const payloadSchema = z.object({ value: z.string() });

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf };
}

suite('jobs PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let now: Date;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookies: ReturnType<typeof cookies>;

  function service(overrides: { maxAttempts?: number; auditThrows?: boolean } = {}) {
    const registry = new JobHandlerRegistry([
      {
        type: 'tests.jobs.execute',
        payloadSchema,
        maxAttempts: overrides.maxAttempts ?? 2,
        leaseMs: 1_000,
        timeoutMs: 5_000,
        backoffBaseMs: 1_000,
        backoffMaxMs: 10_000,
        handler: async () => undefined,
      },
    ]);
    const audit = overrides.auditThrows
      ? { record: async () => Promise.reject(new Error('audit unavailable')) }
      : createAuditService({ database });
    return new JobsService(
      database,
      registry,
      new JobsRepository(database),
      audit,
      () => new Date(now),
      randomUUID,
      () => 0.5,
    );
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
    await database.db.delete(jobs);
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
      'jobs-owner@example.com',
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
    await database.db.delete(jobs);
    await database.db.delete(systemSettings);
    await database.db.execute(sql`truncate table ${auditEvents}`);
  });

  afterAll(async () => {
    if (!database) return;
    await database.db.delete(jobs);
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

  it('enqueues atomically, deduplicates concurrent requests, and detects key conflicts', async () => {
    const jobsService = service();
    await expect(
      database.transaction(async (transaction) => {
        await transaction.insert(systemSettings).values({ key: 'jobs.rollback', value: true });
        await jobsService.enqueue(
          { type: 'tests.jobs.execute', payload: { value: 'rollback' } },
          transaction,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await database.db.select().from(jobs)).toHaveLength(0);
    expect(await database.db.select().from(systemSettings)).toHaveLength(0);

    const deduplicationKey = 'orders:secret-customer-reference-123';
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        jobsService.enqueue({
          type: 'tests.jobs.execute',
          payload: { value: 'same' },
          deduplicationKey,
        }),
      ),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => !result.deduplicated)).toHaveLength(1);
    const [stored] = await database.db.select().from(jobs);
    expect(stored?.deduplicationHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(deduplicationKey);
    await expect(
      jobsService.enqueue({
        type: 'tests.jobs.execute',
        payload: { value: 'different' },
        deduplicationKey,
      }),
    ).rejects.toMatchObject({ code: 'JOB_DEDUPLICATION_CONFLICT' });
  });

  it('lets only one of twenty workers claim a job', async () => {
    const jobsService = service();
    await jobsService.enqueue({ type: 'tests.jobs.execute', payload: { value: 'once' } });
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, index) => jobsService.claim('default', `worker-${index}`, 1)),
    );
    expect(claims.flat()).toHaveLength(1);
    expect(await database.db.select().from(jobAttempts)).toHaveLength(1);
  });

  it('recovers an expired lease and fences every late write from the old worker', async () => {
    const jobsService = service();
    const enqueued = await jobsService.enqueue({
      type: 'tests.jobs.execute',
      payload: { value: 'recover' },
    });
    const [first] = await jobsService.claim('default', 'worker-old', 1);
    expect(first?.id).toBe(enqueued.id);
    const oldToken = first!.claimToken!;

    now = new Date(now.getTime() + 1_001);
    await expect(jobsService.recoverStale()).resolves.toHaveLength(1);
    const [second] = await jobsService.claim('default', 'worker-new', 1);
    expect(second?.claimToken).not.toBe(oldToken);
    await expect(jobsService.heartbeat(enqueued.id, oldToken)).resolves.toBe(false);
    await expect(jobsService.succeed(enqueued.id, oldToken)).resolves.toBe(false);
    await expect(jobsService.fail(first!, oldToken, new Error('late failure'))).resolves.toBeNull();
    await expect(jobsService.succeed(enqueued.id, second!.claimToken!)).resolves.toBe(true);

    const detail = await jobsService.get(enqueued.id);
    expect(detail).toMatchObject({ status: 'succeeded', attemptCount: 2, recoveryCount: 1 });
    expect(detail.attempts.map((attempt) => attempt.status)).toEqual(['succeeded', 'timed_out']);
  });

  it('heartbeats using PostgreSQL interval arithmetic and applies bounded retry/dead rules', async () => {
    const jobsService = service({ maxAttempts: 2 });
    const enqueued = await jobsService.enqueue({
      type: 'tests.jobs.execute',
      payload: { value: 'retry' },
    });
    const [first] = await jobsService.claim('default', 'worker-1', 1);
    now = new Date(now.getTime() + 500);
    expect(await jobsService.heartbeat(enqueued.id, first!.claimToken!)).toBe(true);
    const [heartbeatRecord] = await database.db.select().from(jobs).where(eq(jobs.id, enqueued.id));
    expect(heartbeatRecord?.leaseExpiresAt?.toISOString()).toBe('2026-08-31T08:00:01.500Z');

    const retried = await jobsService.fail(first!, first!.claimToken!, new Error('transient'));
    expect(retried).toMatchObject({ status: 'queued' });
    expect(retried?.runAt.toISOString()).toBe('2026-08-31T08:00:01.500Z');
    expect(await jobsService.claim('default', 'too-early', 1)).toHaveLength(0);
    now = new Date('2026-08-31T08:00:01.500Z');
    const [second] = await jobsService.claim('default', 'worker-2', 1);
    const dead = await jobsService.fail(second!, second!.claimToken!, new Error('again'));
    expect(dead).toMatchObject({ status: 'dead', lastErrorRetryable: false });
    expect((await jobsService.get(enqueued.id)).attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'failed',
    ]);
  });

  it('cancels and manually retries with Audit in the same transaction', async () => {
    const jobsService = service();
    const enqueued = await jobsService.enqueue({
      type: 'tests.jobs.execute',
      payload: { value: 'manual' },
    });
    const [running] = await jobsService.claim('default', 'worker-cancelled', 1);
    const context = { actorType: 'user' as const, actorId: randomUUID() };
    await expect(jobsService.cancel(enqueued.id, context)).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(await jobsService.succeed(enqueued.id, running!.claimToken!)).toBe(false);
    await expect(jobsService.retry(enqueued.id, context)).resolves.toMatchObject({
      status: 'queued',
      maxAttempts: 3,
      manualRetryCount: 1,
    });
    const events = await database.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, enqueued.id));
    expect(events.map((event) => event.action).sort()).toEqual([
      'jobs.job.cancelled',
      'jobs.job.retried',
    ]);

    const failingAuditService = service({ auditThrows: true });
    await expect(failingAuditService.cancel(enqueued.id, context)).rejects.toThrow(
      'audit unavailable',
    );
    expect((await jobsService.get(enqueued.id)).status).toBe('queued');
  });

  it('enforces API permissions and returns only the safe diagnostic projection', async () => {
    const jobsService = service({ maxAttempts: 1 });
    const rawPayload = 'private-recipient@example.com';
    const enqueued = await jobsService.enqueue({
      type: 'tests.jobs.execute',
      payload: { value: rawPayload },
      deduplicationKey: 'private:api-diagnostics-key',
    });
    const [claimed] = await jobsService.claim('default', 'private-worker-id', 1);
    await jobsService.fail(claimed!, claimed!.claimToken!, new Error('private stack detail'));

    expect((await app.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: `/api/jobs/${enqueued.id}`,
      headers: { cookie: ownerCookies.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: enqueued.id,
      status: 'dead',
      payloadSizeBytes: expect.any(Number),
    });
    expect(response.body).not.toContain(rawPayload);
    expect(response.body).not.toContain('private-worker-id');
    expect(response.body).not.toContain(claimed!.claimToken!);
    expect(response.body).not.toContain('private stack detail');

    const retry = await app.inject({
      method: 'POST',
      url: `/api/jobs/${enqueued.id}/actions/retry`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ status: 'queued', manualRetryCount: 1 });
  });
});
