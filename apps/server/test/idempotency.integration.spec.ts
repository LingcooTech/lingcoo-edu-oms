import { randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment, type AppEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { createAccessControlService } from '../src/modules/access-control/public.js';
import {
  accessPermissions,
  accessRolePermissions,
  accessRoles,
  accessUserRoles,
} from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import {
  createIdempotencyService,
  IdempotencyService,
  type IdempotentOperation,
} from '../src/modules/idempotency/public.js';
import {
  hashIdempotencyKey,
  hashIdempotencyRequest,
  previewIdempotencyKey,
} from '../src/modules/idempotency/domain/request-hash.js';
import { IdempotencyRepository } from '../src/modules/idempotency/infrastructure/persistence/idempotency.repository.js';
import { idempotencyRecords } from '../src/modules/idempotency/infrastructure/persistence/idempotency.schema.js';
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

const resultSchema = z.object({ value: z.string() });

function operation(
  name: string,
  overrides: Partial<IdempotentOperation<{ value: string }>> = {},
): IdempotentOperation<{ value: string }> {
  return { operation: name, resultSchema, ...overrides };
}

suite('idempotency integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let ownerId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookies: ReturnType<typeof cookies>;

  async function clearDatabase() {
    await database.db.delete(idempotencyRecords);
    await database.db.delete(systemSettings);
    await database.db.execute(sql`truncate table ${auditEvents}`);
    await database.db.delete(accessUserRoles);
    await database.db.delete(accessRolePermissions);
    await database.db.delete(accessRoles);
    await database.db.delete(accessPermissions);
    await database.db.delete(identityActionTokens);
    await database.db.delete(identitySessions);
    await database.db.delete(identityPasswordCredentials);
    await database.db.delete(identityUsers);
  }

  beforeAll(async () => {
    environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await clearDatabase();
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({ database, identity });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser('owner@example.com', 'owner-secure-password');
    ownerId = owner.id;
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'owner-secure-password' },
    });
    ownerCookies = cookies(login.headers['set-cookie']);
  });

  afterAll(async () => {
    if (!database) return;
    await clearDatabase();
    await app.close();
  });

  it('allows only one concurrent executor and replays the committed result', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.concurrent-create');
    const input = {
      scope: `account:${ownerId}`,
      key: 'concurrent-request-1',
      request: { amount: 100, currency: 'CNY' },
      actorId: ownerId,
    };
    let executions = 0;
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = service.execute(definition, input, async () => {
      executions += 1;
      started();
      await gate;
      return { value: 'created-once' };
    });
    await startedPromise;

    const contenders = Array.from({ length: 19 }, () =>
      service.execute(definition, input, async () => {
        executions += 1;
        return { value: 'must-not-run' };
      }),
    );
    const contenderResults = await Promise.allSettled(contenders);
    expect(contenderResults).toHaveLength(19);
    for (const result of contenderResults) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
      }
    }
    release();
    await expect(first).resolves.toMatchObject({
      value: { value: 'created-once' },
      replayed: false,
      attemptCount: 1,
    });
    await expect(
      service.execute(definition, input, async () => {
        executions += 1;
        return { value: 'must-not-run' };
      }),
    ).resolves.toMatchObject({
      value: { value: 'created-once' },
      replayed: true,
      attemptCount: 1,
    });
    expect(executions).toBe(1);
  });

  it('rejects key reuse with a different request but isolates scopes and operations', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.hash-conflict');
    const base = { scope: 'account:one', key: 'shared-key', request: { amount: 1 } };
    await service.execute(definition, base, async () => ({ value: 'first' }));
    const [stored] = await database.db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.operation, definition.operation));
    expect(stored?.keyHash).toBe(hashIdempotencyKey(base.key));
    expect(stored?.keyHash).not.toBe(base.key);
    expect(stored?.keyPreview).not.toContain(base.key);
    expect(JSON.stringify(stored)).not.toContain(base.key);
    await expect(
      service.execute(definition, { ...base, request: { amount: 2 } }, async () => ({
        value: 'different',
      })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });

    await expect(
      service.execute(definition, { ...base, scope: 'account:two' }, async () => ({
        value: 'other-scope',
      })),
    ).resolves.toMatchObject({ replayed: false });
    await expect(
      service.execute(operation('tests.other-operation'), base, async () => ({
        value: 'other-operation',
      })),
    ).resolves.toMatchObject({ replayed: false });
  });

  it('rolls back business writes on failure and safely retries transient errors', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.transaction-retry');
    const input = { scope: 'system:test', key: 'rollback-key', request: { value: 'same' } };
    await expect(
      service.execute(definition, input, async (transaction) => {
        await transaction.insert(systemSettings).values({
          key: 'idempotency.rollback-side-effect',
          value: 'must-rollback',
        });
        throw new Error('transient failure');
      }),
    ).rejects.toThrow('transient failure');
    expect(
      await database.db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'idempotency.rollback-side-effect')),
    ).toHaveLength(0);

    let retryExecutions = 0;
    await expect(
      service.execute(definition, input, async (transaction) => {
        retryExecutions += 1;
        await transaction.insert(systemSettings).values({
          key: 'idempotency.rollback-side-effect',
          value: 'committed',
        });
        return { value: 'recovered' };
      }),
    ).resolves.toMatchObject({ attemptCount: 2, value: { value: 'recovered' } });
    expect(retryExecutions).toBe(1);
  });

  it('replays safe permanent failures without executing again', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.permanent-failure');
    const input = { scope: 'system:test', key: 'permanent-failure', request: { invalid: true } };
    let executions = 0;
    await expect(
      service.execute(definition, input, async () => {
        executions += 1;
        throw new ApiError(422, 'TEST_RULE_REJECTED', '测试业务规则拒绝');
      }),
    ).rejects.toMatchObject({ code: 'TEST_RULE_REJECTED' });
    await expect(
      service.execute(definition, input, async () => {
        executions += 1;
        return { value: 'must-not-run' };
      }),
    ).rejects.toMatchObject({
      code: 'TEST_RULE_REJECTED',
      details: expect.objectContaining({ replayed: true, retryable: false }),
    });
    expect(executions).toBe(1);
  });

  it('stops retryable failures at the configured attempt limit', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.attempt-limit', { maxAttempts: 2 });
    const input = { scope: 'system:test', key: 'attempt-limit-key', request: { stable: true } };
    let executions = 0;
    const execute = () =>
      service.execute(definition, input, async () => {
        executions += 1;
        throw new Error('transient failure');
      });

    await expect(execute()).rejects.toThrow('transient failure');
    await expect(execute()).rejects.toThrow('transient failure');
    await expect(execute()).rejects.toMatchObject({
      code: 'IDEMPOTENCY_ATTEMPTS_EXHAUSTED',
      details: expect.objectContaining({
        replayed: true,
        retryable: false,
        lastErrorCode: 'IDEMPOTENCY_EXECUTION_FAILED',
      }),
    });
    expect(executions).toBe(2);
  });

  it('does not let a broken custom classifier hide or strand a business failure', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.classifier-fallback', {
      maxAttempts: 1,
      classifyError: () => {
        throw new Error('classifier failure');
      },
    });
    const input = { scope: 'system:test', key: 'classifier-key', request: { stable: true } };

    await expect(
      service.execute(definition, input, async () => {
        throw new Error('business failure');
      }),
    ).rejects.toThrow('business failure');
    const [stored] = await database.db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.operation, definition.operation));
    expect(stored).toMatchObject({
      status: 'failed',
      lastErrorCode: 'IDEMPOTENCY_EXECUTION_FAILED',
      lastErrorRetryable: true,
    });
  });

  it('falls back safely when a custom classifier returns an invalid runtime value', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.invalid-classifier-value', {
      maxAttempts: 1,
      classifyError: (() => ({
        code: 'BROKEN_CLASSIFIER',
        message: 42,
        statusCode: 500,
        retryable: undefined,
      })) as unknown as IdempotentOperation<{ value: string }>['classifyError'],
    });
    const input = { scope: 'system:test', key: 'invalid-classifier', request: { stable: true } };

    await expect(
      service.execute(definition, input, async () => {
        throw new Error('business failure');
      }),
    ).rejects.toThrow('business failure');
    const [stored] = await database.db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.operation, definition.operation));
    expect(stored).toMatchObject({
      status: 'failed',
      lastErrorCode: 'IDEMPOTENCY_EXECUTION_FAILED',
      lastErrorRetryable: true,
    });
  });

  it('returns the persisted JSON shape so first execution and replay stay equivalent', async () => {
    const service = createIdempotencyService({ database });
    const definition: IdempotentOperation<{ optional?: string }> = {
      operation: 'tests.json-roundtrip',
      resultSchema: z.object({ optional: z.string().optional() }),
    };
    const input = { scope: 'system:test', key: 'json-roundtrip-key', request: { stable: true } };

    const first = await service.execute(definition, input, async () => ({ optional: undefined }));
    const replay = await service.execute(definition, input, async () => ({
      optional: 'must-not-run',
    }));
    expect(first.value).toEqual({});
    expect(replay.value).toEqual(first.value);
    expect(replay.replayed).toBe(true);
  });

  it('recovers stale claims and fences the previous owner token', async () => {
    const service = createIdempotencyService({ database });
    const repository = new IdempotencyRepository(database);
    const definition = operation('tests.stale-recovery');
    const input = { scope: 'system:test', key: 'stale-key', request: { stable: true } };
    const previousOwner = randomUUID();
    const [stale] = await database.db
      .insert(idempotencyRecords)
      .values({
        scope: input.scope,
        operation: definition.operation,
        keyHash: hashIdempotencyKey(input.key),
        keyPreview: previewIdempotencyKey(input.key),
        requestHash: hashIdempotencyRequest(input.request),
        ownerToken: previousOwner,
        attemptCount: 1,
        maxAttempts: 3,
        lockedUntil: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning();
    const recovered = await service.execute(definition, input, async () => ({
      value: 'recovered',
    }));
    expect(recovered).toMatchObject({ replayed: false, attemptCount: 2 });

    const staleCompletion = await database.transaction((transaction) =>
      repository.succeed(
        stale!.id,
        previousOwner,
        { value: { value: 'old-owner' } },
        20,
        new Date(Date.now() + 60_000),
        new Date(),
        transaction,
      ),
    );
    expect(staleCompletion).toBeNull();
    const [record] = await database.db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.id, stale!.id));
    expect(record).toMatchObject({ status: 'succeeded', attemptCount: 2, recoveryCount: 1 });
  });

  it('recycles expired completed keys and never purges active processing records', async () => {
    const service = createIdempotencyService({ database });
    const definition = operation('tests.expiration');
    const input = { scope: 'system:test', key: 'expiring-key', request: { generation: 1 } };
    const first = await service.execute(definition, input, async () => ({ value: 'generation-1' }));
    await database.db
      .update(idempotencyRecords)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(idempotencyRecords.id, first.recordId));
    const lockRepository = new IdempotencyRepository(database);
    let releaseLock!: () => void;
    let locked!: () => void;
    const lockedPromise = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const lockGate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const heldLock = database.transaction(async (transaction) => {
      await lockRepository.findByIdentityForClaim(
        input.scope,
        definition.operation,
        hashIdempotencyKey(input.key),
        transaction,
      );
      locked();
      await lockGate;
    });
    await lockedPromise;
    await expect(
      service.execute(definition, { ...input, request: { generation: 2 } }, async () => ({
        value: 'must-wait-for-release',
      })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_IN_PROGRESS' });
    releaseLock();
    await heldLock;

    const targetRepository = new IdempotencyRepository(database);
    vi.spyOn(targetRepository, 'purgeExpiredCompleted').mockResolvedValue(0);
    const targetService = new IdempotencyService(database, targetRepository);
    const second = await targetService.execute(
      definition,
      { ...input, request: { generation: 2 } },
      async () => ({ value: 'generation-2' }),
    );
    expect(second.recordId).not.toBe(first.recordId);

    const processingId = randomUUID();
    await database.db.insert(idempotencyRecords).values({
      id: processingId,
      scope: 'system:test',
      operation: 'tests.active-processing',
      keyHash: hashIdempotencyKey('active-key'),
      keyPreview: previewIdempotencyKey('active-key'),
      requestHash: hashIdempotencyRequest({ active: true }),
      ownerToken: randomUUID(),
      maxAttempts: 3,
      lockedUntil: new Date(Date.now() + 60_000),
      expiresAt: new Date(Date.now() - 1_000),
    });
    await service.purgeExpired();
    expect(
      await database.db
        .select()
        .from(idempotencyRecords)
        .where(eq(idempotencyRecords.id, processingId)),
    ).toHaveLength(1);

    const staleId = randomUUID();
    await database.db.insert(idempotencyRecords).values({
      id: staleId,
      scope: 'system:test',
      operation: 'tests.stale-diagnostic',
      keyHash: hashIdempotencyKey('stale-diagnostic-key'),
      keyPreview: previewIdempotencyKey('stale-diagnostic-key'),
      requestHash: hashIdempotencyRequest({ stale: true }),
      ownerToken: randomUUID(),
      maxAttempts: 3,
      lockedUntil: new Date(Date.now() - 1_000),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const processing = await service.list({ page: 1, pageSize: 100, status: 'processing' });
    expect(processing.items.map((record) => record.id)).toContain(processingId);
    expect(processing.items.map((record) => record.id)).not.toContain(staleId);
  });

  it('exposes permission-protected read-only diagnostics without stored results or raw keys', async () => {
    const unauthorized = await app.inject({ method: 'GET', url: '/api/idempotency/records' });
    expect(unauthorized.statusCode).toBe(401);

    const list = await app.inject({
      method: 'GET',
      url: '/api/idempotency/records?operation=tests.concurrent-create&status=succeeded',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(1);
    const summary = list.json().items[0] as Record<string, unknown>;
    expect(summary).not.toHaveProperty('resultEnvelope');
    expect(summary).not.toHaveProperty('keyHash');
    expect(summary).not.toHaveProperty('ownerToken');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/idempotency/records/${summary.id}`,
      headers: { cookie: ownerCookies.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      operation: 'tests.concurrent-create',
      status: 'succeeded',
      resultStored: true,
      requestHashVersion: 1,
    });
    expect(detail.json()).not.toHaveProperty('resultEnvelope');
    expect(detail.json()).not.toHaveProperty('value');

    expect(app.hasRoute({ method: 'DELETE', url: '/api/idempotency/records/:id' })).toBe(false);
    const noMutationRoute = await app.inject({
      method: 'DELETE',
      url: `/api/idempotency/records/${summary.id}`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
    });
    expect(noMutationRoute.statusCode).toBeGreaterThanOrEqual(400);
  });
});
