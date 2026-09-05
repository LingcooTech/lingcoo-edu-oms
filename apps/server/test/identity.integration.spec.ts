import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment, type AppEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { DisabledIdentityActionDelivery } from '../src/modules/identity/application/action-delivery.port.js';
import { IdentityService } from '../src/modules/identity/application/identity.service.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { IdentityRepository } from '../src/modules/identity/infrastructure/persistence/identity.repository.js';
import {
  accessPermissions,
  accessRolePermissions,
  accessRoles,
  accessUserRoles,
} from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === 'true';
const suite = runDatabaseTests ? describe : describe.skip;

function cookiePair(headers: string | string[] | undefined): {
  cookie: string;
  csrf: string;
  session: string;
} {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Identity cookies were not set');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf, session };
}

suite('identity integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let service: IdentityService;

  beforeAll(async () => {
    environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL,
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      AUTH_EXPOSE_TEST_TOKENS: 'true',
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await database.db.delete(accessUserRoles);
    await database.db.delete(accessRolePermissions);
    await database.db.delete(accessRoles);
    await database.db.delete(accessPermissions);
    await database.db.delete(identityActionTokens);
    await database.db.delete(identitySessions);
    await database.db.delete(identityPasswordCredentials);
    await database.db.delete(identityUsers);
    const repository = new IdentityRepository(database);
    service = new IdentityService(repository, environment, new DisabledIdentityActionDelivery());
    app = await buildApp({ environment, database });
  });

  afterAll(async () => {
    if (!database) return;
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

  it('bootstraps idempotently without overwriting the credential', async () => {
    const first = await service.ensureBootstrapUser('owner@example.com', 'first-secure-password');
    const second = await service.ensureBootstrapUser(
      'owner@example.com',
      'different-password-value',
    );
    expect(second.id).toBe(first.id);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'OWNER@example.com', password: 'first-secure-password' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('stores only token digests and enforces session-bound csrf', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'first-secure-password' },
    });
    const cookies = cookiePair(login.headers['set-cookie']);
    expect(login.body).not.toContain('passwordHash');
    expect(login.body).not.toContain(cookies.session);

    const [storedSession] = await database.db.select().from(identitySessions).limit(1);
    expect(storedSession?.tokenDigest).toHaveLength(64);
    expect(storedSession?.tokenDigest).not.toBe(cookies.session);
    expect(storedSession?.csrfDigest).not.toBe(cookies.csrf);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookies.cookie },
    });
    expect(me.statusCode).toBe(200);

    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookies.cookie },
    });
    expect(missingCsrf.statusCode).toBe(403);

    const wrongCsrf = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: cookies.cookie, 'x-csrf-token': 'wrong-token' },
    });
    expect(wrongCsrf.statusCode).toBe(403);
  });

  it('provides an authorization-neutral account management port', async () => {
    const member = await service.createUser({
      email: ' Member@Example.com ',
      password: 'member-secure-password',
      displayName: 'Example Member',
    });
    const page = await service.listUsers({ page: 1, pageSize: 20, search: 'member' });
    expect(page.items).toContainEqual(expect.objectContaining({ id: member.id, status: 'active' }));
    await expect(
      service.createUser({ email: 'member@example.com', password: 'another-secure-password' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_EMAIL_EXISTS' });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'member@example.com', password: 'member-secure-password' },
    });
    const cookies = cookiePair(login.headers['set-cookie']);
    await service.updateUser({ userId: member.id, status: 'disabled' });
    const revoked = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookies.cookie },
    });
    expect(revoked.statusCode).toBe(401);
  });

  it('lists and revokes only another session owned by the current account', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'first-secure-password' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'first-secure-password' },
    });
    const firstCookies = cookiePair(first.headers['set-cookie']);
    const secondCookies = cookiePair(second.headers['set-cookie']);
    const sessions = await app.inject({
      method: 'GET',
      url: '/api/auth/sessions',
      headers: { cookie: firstCookies.cookie },
    });
    const secondSessionId = second.json().session.id as string;
    expect(
      (sessions.json().items as Array<{ id: string; current: boolean }>).find(
        (item) => item.id === secondSessionId && !item.current,
      ),
    ).toBeTruthy();

    const revoked = await app.inject({
      method: 'POST',
      url: `/api/auth/sessions/${secondSessionId}/revoke`,
      headers: { cookie: firstCookies.cookie, 'x-csrf-token': firstCookies.csrf },
    });
    expect(revoked.statusCode).toBe(200);
    const revokedSession = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: secondCookies.cookie },
    });
    expect(revokedSession.statusCode).toBe(401);
  });

  it('revokes every session when the password changes', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'first-secure-password' },
    });
    const cookies = cookiePair(login.headers['set-cookie']);
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: { cookie: cookies.cookie, 'x-csrf-token': cookies.csrf },
      payload: { currentPassword: 'first-secure-password', newPassword: 'second-secure-password' },
    });
    expect(changed.statusCode).toBe(200);
    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookies.cookie },
    });
    expect(oldSession.statusCode).toBe(401);
  });

  it('uses a one-time reset token and returns a generic response for unknown accounts', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'unknown@example.com' },
    });
    expect(unknown.json()).toEqual({ accepted: true });

    const requested = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'owner@example.com' },
    });
    const actionToken = requested.json().testToken as string;
    expect(actionToken).toBeTruthy();
    const [stored] = await database.db
      .select()
      .from(identityActionTokens)
      .where(eq(identityActionTokens.purpose, 'password_reset'))
      .limit(1);
    expect(stored?.tokenDigest).not.toBe(actionToken);

    const payload = { token: actionToken, newPassword: 'third-secure-password' };
    const confirmed = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload,
    });
    expect(confirmed.statusCode).toBe(200);
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload,
    });
    expect(replay.statusCode).toBe(400);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@example.com', password: 'third-secure-password' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('rate limits repeated login attempts by client address', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '198.51.100.20',
        payload: { email: 'unknown@example.com', password: 'incorrect-password' },
      });
      responses.push(response);
    }
    expect(responses[0]?.headers['x-ratelimit-limit']).toBe('10');
    expect(responses.map((response) => response.statusCode)).toContain(429);
    const limited = responses.find((response) => response.statusCode === 429);
    expect(limited?.json()).toMatchObject({ error: { code: 'RATE_LIMIT_EXCEEDED' } });
  });
});
