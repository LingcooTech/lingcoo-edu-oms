import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
import { applicationBranding } from '../src/modules/branding/infrastructure/persistence/branding.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { jobs } from '../src/modules/jobs/infrastructure/persistence/jobs.schema.js';
import { systemSettings } from '../src/modules/settings/infrastructure/persistence/settings.schema.js';
import {
  storageAssetReferences,
  storageAssets,
  storageObjects,
} from '../src/modules/storage/infrastructure/persistence/storage.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf };
}

suite('branding PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let storageRoot: string;
  let authentication: ReturnType<typeof cookies>;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'branding-integration-'));
    environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      APP_NAME: 'Branding Integration',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      AUTH_EXPOSE_TEST_TOKENS: 'true',
      APP_PUBLIC_URL: 'http://localhost:5173',
      MAIL_TRANSPORT: 'capture',
      STORAGE_PROVIDER: 'local',
      STORAGE_LOCAL_ROOT: storageRoot,
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await cleanup();
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({ database, identity });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser(
      'branding-owner@example.com',
      'owner-secure-password',
    );
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'owner-secure-password' },
    });
    authentication = cookies(login.headers['set-cookie']);
  });

  beforeEach(async () => {
    await database.db.delete(applicationBranding);
    await database.db.delete(storageAssetReferences);
    await database.db.delete(storageObjects);
    await database.db.delete(storageAssets);
    await database.db.delete(jobs);
    await database.db.delete(systemSettings);
    await database.db.execute(sql`truncate table ${auditEvents}`);
  });

  afterAll(async () => {
    if (!database) return;
    await cleanup();
    await app.close();
    await rm(storageRoot, { recursive: true, force: true });
  });

  async function cleanup() {
    await database.db.delete(applicationBranding);
    await database.db.delete(storageAssetReferences);
    await database.db.delete(storageObjects);
    await database.db.delete(storageAssets);
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
  }

  function ownerHeaders() {
    return { cookie: authentication.cookie, 'x-csrf-token': authentication.csrf };
  }

  async function createAsset(input: { filename: string; contentType: string; content: Buffer }) {
    const authorization = await app.inject({
      method: 'POST',
      url: '/api/storage/assets/upload-authorizations',
      headers: {
        ...ownerHeaders(),
        'idempotency-key': `branding-${crypto.randomUUID()}`,
      },
      payload: {
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.content.length,
        visibility: 'private',
      },
    });
    expect(authorization.statusCode).toBe(200);
    const boundary = `branding-${crypto.randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${input.filename}"\r\nContent-Type: ${input.contentType}\r\n\r\n`,
      ),
      input.content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const uploaded = await app.inject({
      method: 'POST',
      url: `/api/storage/uploads/${authorization.json().objectId}/content`,
      headers: { ...ownerHeaders(), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(uploaded.statusCode).toBe(200);
    return uploaded.json() as { id: string; revision: number };
  }

  it('returns safe defaults publicly and protects the Admin configuration', async () => {
    const publicResponse = await app.inject({ method: 'GET', url: '/api/branding/public' });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json()).toEqual({
      appName: 'Branding Integration',
      primaryColor: '#1677ff',
      loginTitle: '登录管理后台',
      loginSubtitle: '使用部署管理员账号继续',
      logoUrl: null,
      faviconUrl: null,
      revision: 0,
    });
    expect(publicResponse.headers['cache-control']).toContain('must-revalidate');
    expect(publicResponse.headers.etag).toMatch(/^"branding-[a-f0-9]{24}"$/);
    const notModified = await app.inject({
      method: 'GET',
      url: '/api/branding/public',
      headers: { 'if-none-match': publicResponse.headers.etag },
    });
    expect(notModified.statusCode).toBe(304);
    expect((await app.inject({ method: 'GET', url: '/api/branding' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/branding',
          headers: { cookie: authentication.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });

  it('updates profile and image references atomically and serves only selected image content', async () => {
    const logo = await createAsset({
      filename: 'logo.png',
      contentType: 'image/png',
      content: PNG,
    });
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/branding',
      headers: ownerHeaders(),
      payload: {
        expectedRevision: 0,
        appName: 'Lingcoo Console',
        logoAssetId: logo.id,
        faviconAssetId: logo.id,
        primaryColor: '#16A085',
        loginTitle: '欢迎回来',
        loginSubtitle: '请使用管理员账号继续',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      appName: 'Lingcoo Console',
      logoAssetId: logo.id,
      faviconAssetId: logo.id,
      primaryColor: '#16a085',
      revision: 1,
    });
    expect(updated.json().logoUrl).toMatch(/^\/api\/branding\/assets\/logo\?v=/);
    expect(await database.db.select().from(storageAssetReferences)).toHaveLength(2);
    expect(await database.db.select().from(applicationBranding)).toHaveLength(1);

    const publicResponse = await app.inject({ method: 'GET', url: '/api/branding/public' });
    expect(publicResponse.json()).not.toHaveProperty('logoAssetId');
    expect(JSON.stringify(publicResponse.json())).not.toMatch(
      /provider|bucket|objectKey|storageRoot/i,
    );
    const content = await app.inject({ method: 'GET', url: '/api/branding/assets/logo' });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toBe('image/png');
    expect(content.rawPayload.equals(PNG)).toBe(true);

    const stale = await app.inject({
      method: 'PUT',
      url: '/api/branding',
      headers: ownerHeaders(),
      payload: {
        expectedRevision: 0,
        appName: 'Stale overwrite',
        logoAssetId: null,
        faviconAssetId: null,
        primaryColor: '#000000',
        loginTitle: '失效更新',
        loginSubtitle: '不能生效',
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('BRANDING_VERSION_CONFLICT');
    expect(await database.db.select().from(storageAssetReferences)).toHaveLength(2);

    const blockedDelete = await app.inject({
      method: 'DELETE',
      url: `/api/storage/assets/${logo.id}`,
      headers: ownerHeaders(),
      payload: { expectedRevision: logo.revision },
    });
    expect(blockedDelete.statusCode).toBe(409);
    expect(blockedDelete.json().error.code).toBe('STORAGE_ASSET_IN_USE');
    expect(
      (await database.db.select().from(auditEvents)).some(
        (event) => event.action === 'branding.updated',
      ),
    ).toBe(true);
  });

  it('rejects non-image references without leaving profile or reference rows', async () => {
    const text = await createAsset({
      filename: 'note.txt',
      contentType: 'text/plain',
      content: Buffer.from('hello'),
    });
    const auditCountBefore = (await database.db.select().from(auditEvents)).length;
    const response = await app.inject({
      method: 'PUT',
      url: '/api/branding',
      headers: ownerHeaders(),
      payload: {
        expectedRevision: 0,
        appName: 'Invalid Branding',
        logoAssetId: text.id,
        faviconAssetId: null,
        primaryColor: '#1677ff',
        loginTitle: '欢迎登录',
        loginSubtitle: '继续',
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('STORAGE_ASSET_MEDIA_KIND_MISMATCH');
    expect(await database.db.select().from(applicationBranding)).toHaveLength(0);
    expect(await database.db.select().from(storageAssetReferences)).toHaveLength(0);
    expect(await database.db.select().from(auditEvents)).toHaveLength(auditCountBefore);
  });
});
