import { eq, sql } from 'drizzle-orm';
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
import { createAuditService, type AuditContext } from '../src/modules/audit/public.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf };
}

suite('audit integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookies: ReturnType<typeof cookies>;

  const actor: AuditContext = {
    actorType: 'user',
    actorId: '00000000-0000-4000-8000-000000000001',
    actorLabel: 'Owner',
    requestId: 'audit-integration-test',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  };

  async function clearDatabase() {
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
    const audit = createAuditService({ database });
    const identity = createIdentityService({ database, environment, audit });
    const access = createAccessControlService({ database, identity, audit });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser('owner@example.com', 'owner-secure-password');
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

  it('records security and management events and exposes permission-protected queries', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/access/roles',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: { key: 'audited-role', name: '审计角色', permissions: ['accounts.read'] },
    });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: '/api/audit/events?category=access&action=access.role.created',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      total: 1,
      items: [
        {
          category: 'access',
          action: 'access.role.created',
          actorLabel: 'owner@example.com',
          resourceId: created.json().id,
        },
      ],
    });
    const eventId = list.json().items[0].id as string;
    const detail = await app.inject({
      method: 'GET',
      url: `/api/audit/events/${eventId}`,
      headers: { cookie: ownerCookies.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'permissions' })]),
    );

    const security = await app.inject({
      method: 'GET',
      url: '/api/audit/events?category=security&action=identity.login.succeeded',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(security.json()).toMatchObject({
      total: 1,
      items: [{ action: 'identity.login.succeeded', resourceType: 'identity.session' }],
    });
  });

  it('keeps every Access management mutation inside the audited application path', async () => {
    const headers = { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf };
    const role = await app.inject({
      method: 'POST',
      url: '/api/access/roles',
      headers,
      payload: { key: 'operations', name: '运营', permissions: ['accounts.read'] },
    });
    const roleId = role.json().id as string;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/access/roles/${roleId}`,
          headers,
          payload: { name: '运营管理员' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/access/roles/${roleId}/permissions`,
          headers,
          payload: { permissions: ['accounts.read', 'roles.read'] },
        })
      ).statusCode,
    ).toBe(200);
    const user = await app.inject({
      method: 'POST',
      url: '/api/access/users',
      headers,
      payload: {
        email: 'audited-user@example.com',
        password: 'audited-user-password',
        displayName: '待审计账号',
        roleIds: [roleId],
      },
    });
    const userId = user.json().id as string;
    expect(user.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/access/users/${userId}`,
          headers,
          payload: { displayName: '已审计账号' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/access/users/${userId}/roles`,
          headers,
          payload: { roleIds: [] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/access/roles/${roleId}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);

    const accessEvents = await app.inject({
      method: 'GET',
      url: '/api/audit/events?category=access&pageSize=100',
      headers: { cookie: ownerCookies.cookie },
    });
    const accessActions = accessEvents
      .json()
      .items.map((event: { action: string }) => event.action);
    expect(accessActions).toEqual(
      expect.arrayContaining([
        'access.role.created',
        'access.role.updated',
        'access.role.permissions-replaced',
        'access.account.roles-replaced',
        'access.role.deleted',
      ]),
    );
    const accountEvents = await app.inject({
      method: 'GET',
      url: '/api/audit/events?category=account&pageSize=100',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(accountEvents.json().items.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining(['access.account.created', 'access.account.updated']),
    );
  });

  it('redacts sensitive metadata and dynamic change fields before persistence', async () => {
    const audit = createAuditService({ database });
    await audit.record({
      ...actor,
      category: 'security',
      action: 'test.redaction.checked',
      resourceType: 'test.resource',
      changes: [{ field: 'password', before: 'old-password', after: 'new-password' }],
      metadata: { passwordHash: 'hash', nested: { accessToken: 'token', safe: 'visible' } },
    });
    const [event] = await database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'test.redaction.checked'));
    expect(event?.changes).toEqual([
      { field: 'password', before: '[REDACTED]', after: '[REDACTED]' },
    ]);
    expect(event?.metadata).toEqual({
      passwordHash: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', safe: 'visible' },
    });
  });

  it('rolls back a business mutation when the required audit append fails', async () => {
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({
      database,
      identity,
      audit: {
        async record() {
          throw new Error('simulated audit failure');
        },
      },
    });
    await expect(
      access.createRole({ key: 'must-rollback', name: '必须回滚', permissions: [] }, actor),
    ).rejects.toThrow('simulated audit failure');
    expect((await access.listRoles()).some((role) => role.key === 'must-rollback')).toBe(false);
  });

  it('rejects updates and deletes at the database boundary', async () => {
    const audit = createAuditService({ database });
    await audit.record({
      ...actor,
      category: 'system',
      action: 'test.immutability.checked',
      resourceType: 'test.resource',
    });
    const [event] = await database.db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.action, 'test.immutability.checked'));
    await expect(
      database.db
        .update(auditEvents)
        .set({ outcome: 'failure' })
        .where(eq(auditEvents.id, event!.id)),
    ).rejects.toThrow();
    await expect(
      database.db.delete(auditEvents).where(eq(auditEvents.id, event!.id)),
    ).rejects.toThrow();
    const [unchanged] = await database.db
      .select({ outcome: auditEvents.outcome })
      .from(auditEvents)
      .where(eq(auditEvents.id, event!.id));
    expect(unchanged?.outcome).toBe('success');
  });
});
