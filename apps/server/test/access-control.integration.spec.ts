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

suite('access control integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerId: string;
  let ownerCookies: ReturnType<typeof cookies>;

  async function clearDatabase() {
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
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser('owner@example.com', 'owner-secure-password');
    ownerId = owner.id;
    await access.assignOwner(owner.id);
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

  it('synchronizes a single protected Owner role with the complete permission catalog', async () => {
    const roles = await app.inject({
      method: 'GET',
      url: '/api/access/roles',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(roles.statusCode).toBe(200);
    expect(roles.json().items).toEqual([
      expect.objectContaining({ key: 'system.owner', system: true, userCount: 1 }),
    ]);

    const permissions = await app.inject({
      method: 'GET',
      url: '/api/access/permissions',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(permissions.json().permissions).toEqual(
      expect.arrayContaining(['accounts.manage', 'roles.manage', 'audit.read']),
    );
  });

  it('defaults to no permissions and denies an unassigned authenticated account', async () => {
    const identity = createIdentityService({ database, environment });
    await identity.createUser({ email: 'viewer@example.com', password: 'viewer-secure-password' });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'viewer@example.com', password: 'viewer-secure-password' },
    });
    const memberCookies = cookies(login.headers['set-cookie']);
    const current = await app.inject({
      method: 'GET',
      url: '/api/access/permissions',
      headers: { cookie: memberCookies.cookie },
    });
    expect(current.json()).toEqual({ permissions: [] });
    const denied = await app.inject({
      method: 'GET',
      url: '/api/access/roles',
      headers: { cookie: memberCookies.cookie },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: { code: 'ACCESS_PERMISSION_DENIED' } });
  });

  it('manages a custom role and account through permission-protected APIs', async () => {
    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/access/roles',
      headers: { cookie: ownerCookies.cookie },
      payload: { key: 'support', name: '客服', permissions: ['accounts.read'] },
    });
    expect(missingCsrf.statusCode).toBe(403);

    const createdRole = await app.inject({
      method: 'POST',
      url: '/api/access/roles',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: { key: 'support', name: '客服', permissions: ['accounts.read'] },
    });
    expect(createdRole.statusCode).toBe(201);
    const roleId = createdRole.json().id as string;

    const createdUser = await app.inject({
      method: 'POST',
      url: '/api/access/users',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: {
        email: 'support@example.com',
        password: 'support-secure-password',
        displayName: '客服账号',
        roleIds: [roleId],
      },
    });
    expect(createdUser.statusCode).toBe(201);
    expect(createdUser.json()).toMatchObject({
      email: 'support@example.com',
      roles: [{ key: 'support' }],
    });

    const accountList = await app.inject({
      method: 'GET',
      url: '/api/access/users?search=support',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(accountList.json()).toMatchObject({
      total: 1,
      items: [{ email: 'support@example.com' }],
    });
  });

  it('rolls back account creation when its role assignment is invalid', async () => {
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/access/users',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: {
        email: 'rollback@example.com',
        password: 'rollback-secure-password',
        roleIds: ['04fc3197-0356-40a7-a61f-e1d647e3a9bb'],
      },
    });
    expect(rejected.statusCode).toBe(400);
    const identity = createIdentityService({ database, environment });
    const page = await identity.listUsers({
      page: 1,
      pageSize: 20,
      search: 'rollback@example.com',
    });
    expect(page.total).toBe(0);
  });

  it('protects the system role and Owner assignment from administrative mistakes', async () => {
    const roleList = await app.inject({
      method: 'GET',
      url: '/api/access/roles',
      headers: { cookie: ownerCookies.cookie },
    });
    const ownerRole = (roleList.json().items as Array<{ id: string; key: string }>).find(
      (role) => role.key === 'system.owner',
    )!;
    const deleteOwner = await app.inject({
      method: 'DELETE',
      url: `/api/access/roles/${ownerRole.id}`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
    });
    expect(deleteOwner.statusCode).toBe(400);
    expect(deleteOwner.json()).toMatchObject({ error: { code: 'ACCESS_SYSTEM_ROLE_PROTECTED' } });

    const removeOwner = await app.inject({
      method: 'PUT',
      url: `/api/access/users/${ownerId}/roles`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: { roleIds: [] },
    });
    expect(removeOwner.statusCode).toBe(400);
    expect(removeOwner.json()).toMatchObject({ error: { code: 'ACCESS_OWNER_PROTECTED' } });
  });
});
