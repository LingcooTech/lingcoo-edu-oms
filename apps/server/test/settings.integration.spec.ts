import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
import { createAuditService } from '../src/modules/audit/public.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import {
  createSettingsService,
  type SettingDefinition,
  type SettingsConnectionTester,
} from '../src/modules/settings/public.js';
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

suite('settings integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerId: string;
  let ownerCookies: ReturnType<typeof cookies>;

  async function clearDatabase() {
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
      APP_NAME: 'Settings integration',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await clearDatabase();
    const audit = createAuditService({ database });
    const identity = createIdentityService({ database, environment, audit });
    const access = createAccessControlService({ database, identity, audit });
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

  it('exposes only registered public values and keeps environment overrides read-only', async () => {
    const publicResponse = await app.inject({ method: 'GET', url: '/api/settings/public' });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toEqual({
      values: {
        'application.locale': 'zh-CN',
        'application.name': 'Settings integration',
      },
    });

    const unauthorized = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(unauthorized.statusCode).toBe(401);

    const list = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'application.name',
          source: 'environment',
          readOnly: true,
          version: null,
        }),
        expect.objectContaining({
          key: 'application.timezone',
          kind: 'internal',
          source: 'default',
        }),
      ]),
    );

    const rejected = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.name',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: { value: 'Database name', expectedVersion: null },
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toMatchObject({ error: { code: 'SETTING_ENVIRONMENT_OVERRIDE' } });
  });

  it('separates settings read and manage permissions', async () => {
    const ownerHeaders = {
      cookie: ownerCookies.cookie,
      'x-csrf-token': ownerCookies.csrf,
    };
    const role = await app.inject({
      method: 'POST',
      url: '/api/access/roles',
      headers: ownerHeaders,
      payload: {
        key: 'settings-viewer',
        name: '设置查看者',
        permissions: ['settings.read'],
      },
    });
    expect(role.statusCode).toBe(201);
    const viewer = await app.inject({
      method: 'POST',
      url: '/api/access/users',
      headers: ownerHeaders,
      payload: {
        email: 'settings-viewer@example.com',
        password: 'settings-viewer-password',
        roleIds: [role.json().id],
      },
    });
    expect(viewer.statusCode).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'settings-viewer@example.com',
        password: 'settings-viewer-password',
      },
    });
    const viewerCookies = cookies(login.headers['set-cookie']);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/settings',
          headers: { cookie: viewerCookies.cookie },
        })
      ).statusCode,
    ).toBe(200);
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.locale',
      headers: {
        cookie: viewerCookies.cookie,
        'x-csrf-token': viewerCookies.csrf,
      },
      payload: { value: 'en-US', expectedVersion: null },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: { code: 'ACCESS_PERMISSION_DENIED' } });
  });

  it('uses explicit optimistic versions and restores the default source', async () => {
    const headers = { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf };
    const missingCsrf = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.locale',
      headers: { cookie: ownerCookies.cookie },
      payload: { value: 'en-US', expectedVersion: null },
    });
    expect(missingCsrf.statusCode).toBe(403);

    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.locale',
      headers,
      payload: { value: 'invalid-locale', expectedVersion: null },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'SETTING_VALUE_INVALID' } });

    const created = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.locale',
      headers,
      payload: { value: 'en-US', expectedVersion: null },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ source: 'database', value: 'en-US', version: 1 });

    const stale = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.locale',
      headers,
      payload: { value: 'zh-CN', expectedVersion: null },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: 'SETTING_VERSION_CONFLICT' } });

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/settings/application.locale',
      headers,
      payload: { value: 'zh-CN', expectedVersion: 1 },
    });
    expect(updated.json()).toMatchObject({ source: 'database', value: 'zh-CN', version: 2 });

    const cleared = await app.inject({
      method: 'DELETE',
      url: '/api/settings/application.locale',
      headers,
      payload: { expectedVersion: 2 },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ source: 'default', value: 'zh-CN', version: null });
  });

  it('encrypts secrets, never returns plaintext, rotates keys, and audits safely', async () => {
    const definitions: SettingDefinition[] = [
      {
        key: 'integration.api-token',
        group: 'integration',
        groupLabel: '集成测试',
        label: 'API Token',
        description: '用于验证敏感设置边界。',
        kind: 'secret',
        schema: z.string().min(8),
        control: 'text',
      },
      {
        key: 'integration.replaceable-token',
        group: 'integration',
        groupLabel: '集成测试',
        label: 'Replaceable Token',
        description: '用于验证旧密钥不可用时仍可整体替换敏感设置。',
        kind: 'secret',
        schema: z.string().min(8),
        control: 'text',
      },
    ];
    const audit = createAuditService({ database });
    const oldEnvironment = {
      ...environment,
      SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'old-v1',
      SETTINGS_ENCRYPTION_KEYS: { 'old-v1': 'old-key-material-at-least-thirty-two-characters' },
    };
    const oldService = createSettingsService({
      database,
      environment: oldEnvironment,
      audit,
      definitions,
    }).service;
    const context = {
      actorType: 'user' as const,
      actorId: ownerId,
      actorLabel: 'Owner',
      requestId: 'settings-secret-test',
    };
    const plaintext = 'top-secret-token';
    const view = await oldService.save(
      'integration.api-token',
      { value: plaintext, expectedVersion: null },
      context,
    );
    expect(view).not.toHaveProperty('value');
    expect(view).toMatchObject({ kind: 'secret', configured: true, version: 1 });

    const [storedBefore] = await database.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'integration.api-token'));
    expect(storedBefore?.value).toBeNull();
    expect(storedBefore?.encryptionKeyId).toBe('old-v1');
    expect(JSON.stringify(storedBefore?.encryptedValue)).not.toContain(plaintext);
    expect(await oldService.getValue('integration.api-token')).toBe(plaintext);

    await oldService.save(
      'integration.replaceable-token',
      { value: 'old-replaceable-token', expectedVersion: null },
      context,
    );
    const replacementService = createSettingsService({
      database,
      environment: {
        ...environment,
        SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'new-v2',
        SETTINGS_ENCRYPTION_KEYS: {
          'new-v2': 'new-key-material-at-least-thirty-two-characters',
        },
      },
      audit,
      definitions,
    }).service;
    await expect(
      replacementService.save(
        'integration.replaceable-token',
        { value: 'new-replaceable-token', expectedVersion: 1 },
        context,
      ),
    ).resolves.not.toHaveProperty('value');
    expect(await replacementService.getValue('integration.replaceable-token')).toBe(
      'new-replaceable-token',
    );

    const newService = createSettingsService({
      database,
      environment: {
        ...environment,
        SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'new-v2',
        SETTINGS_ENCRYPTION_KEYS: {
          'old-v1': 'old-key-material-at-least-thirty-two-characters',
          'new-v2': 'new-key-material-at-least-thirty-two-characters',
        },
      },
      audit,
      definitions,
    }).service;
    await expect(newService.rotateSecrets(context)).resolves.toEqual({ rotated: 1 });
    expect(await newService.getValue('integration.api-token')).toBe(plaintext);
    const [storedAfter] = await database.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'integration.api-token'));
    expect(storedAfter).toMatchObject({ encryptionKeyId: 'new-v2', version: 2 });

    const secretAuditRows = await database.db
      .select({ changes: auditEvents.changes, metadata: auditEvents.metadata })
      .from(auditEvents)
      .where(eq(auditEvents.resourceId, 'integration.api-token'));
    expect(JSON.stringify(secretAuditRows)).not.toContain(plaintext);
  });

  it('runs composite connection testers through resolved settings and aborts timeouts', async () => {
    const definitions: SettingDefinition[] = [
      {
        key: 'integration.endpoint',
        group: 'integration',
        groupLabel: '集成测试',
        label: '服务地址',
        description: '连接测试目标。',
        kind: 'internal',
        schema: z.url(),
        defaultValue: 'https://example.com',
        control: 'url',
      },
    ];
    let receivedEndpoint: unknown;
    const successTester: SettingsConnectionTester = {
      key: 'integration.endpoint-health',
      group: 'integration',
      label: '服务连接',
      description: '验证连接测试组合端口。',
      requiredSettings: ['integration.endpoint'],
      async test(values, signal) {
        receivedEndpoint = values.get('integration.endpoint');
        expect(signal.aborted).toBe(false);
        return { ok: true, message: '连接正常' };
      },
    };
    const audit = createAuditService({ database });
    const successService = createSettingsService({
      database,
      environment,
      audit,
      definitions,
      connectionTesters: [successTester],
    }).service;
    const context = {
      actorType: 'user' as const,
      actorId: ownerId,
      actorLabel: 'Owner',
      requestId: 'settings-connection-test',
    };
    await expect(successService.testConnection(successTester.key, context)).resolves.toMatchObject({
      ok: true,
      message: '连接正常',
    });
    expect(receivedEndpoint).toBe('https://example.com');

    let aborted = false;
    const timeoutTester: SettingsConnectionTester = {
      ...successTester,
      key: 'integration.endpoint-timeout',
      timeoutMs: 100,
      test: (_values, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve({ ok: false, message: 'aborted' });
          });
        }),
    };
    const timeoutService = createSettingsService({
      database,
      environment,
      audit,
      definitions,
      connectionTesters: [timeoutTester],
    }).service;
    await expect(timeoutService.testConnection(timeoutTester.key, context)).resolves.toMatchObject({
      ok: false,
    });
    expect(aborted).toBe(true);

    const requestAbortTester: SettingsConnectionTester = {
      ...successTester,
      key: 'integration.endpoint-request-abort',
      timeoutMs: 30_000,
      test: () => new Promise(() => undefined),
    };
    const requestAbortService = createSettingsService({
      database,
      environment,
      audit,
      definitions,
      connectionTesters: [requestAbortTester],
    }).service;
    const requestController = new AbortController();
    const abortedRequest = requestAbortService.testConnection(
      requestAbortTester.key,
      context,
      requestController.signal,
    );
    requestController.abort();
    await expect(abortedRequest).resolves.toMatchObject({ ok: false });
  });

  it('rolls back setting writes when the required audit append fails', async () => {
    const definitions: SettingDefinition[] = [
      {
        key: 'integration.rollback-value',
        group: 'integration',
        groupLabel: '集成测试',
        label: '回滚设置',
        description: '验证设置与审计共享事务。',
        kind: 'internal',
        schema: z.string().min(1),
        control: 'text',
      },
    ];
    const service = createSettingsService({
      database,
      environment,
      definitions,
      audit: {
        async record() {
          throw new Error('simulated audit failure');
        },
      },
    }).service;
    await expect(
      service.save(
        'integration.rollback-value',
        { value: 'must-not-persist', expectedVersion: null },
        {
          actorType: 'user',
          actorId: ownerId,
          actorLabel: 'Owner',
          requestId: 'settings-audit-rollback-test',
        },
      ),
    ).rejects.toThrow('simulated audit failure');
    const [record] = await database.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'integration.rollback-value'));
    expect(record).toBeUndefined();
  });
});
