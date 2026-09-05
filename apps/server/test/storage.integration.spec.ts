import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq, sql } from 'drizzle-orm';
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

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf };
}

suite('storage PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let storageRoot: string;
  let ownerId: string;
  let authentication: ReturnType<typeof cookies>;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'storage-integration-'));
    environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      AUTH_EXPOSE_TEST_TOKENS: 'true',
      APP_PUBLIC_URL: 'http://localhost:5173',
      MAIL_TRANSPORT: 'capture',
      STORAGE_PROVIDER: 'local',
      STORAGE_LOCAL_ROOT: storageRoot,
      STORAGE_MAX_UPLOAD_BYTES: '1024',
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await cleanup();
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({ database, identity });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser(
      'storage-owner@example.com',
      'owner-secure-password',
    );
    ownerId = owner.id;
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

  async function authorize(payload: Record<string, unknown>, key: string, replacementId?: string) {
    return app.inject({
      method: 'POST',
      url: replacementId
        ? `/api/storage/assets/${replacementId}/replacement-authorizations`
        : '/api/storage/assets/upload-authorizations',
      headers: {
        cookie: authentication.cookie,
        'x-csrf-token': authentication.csrf,
        'idempotency-key': key,
      },
      payload,
    });
  }

  async function upload(objectId: string, content: string, filename = 'hello.txt') {
    const boundary = `storage-${crypto.randomUUID()}`;
    const body = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`,
    );
    return app.inject({
      method: 'POST',
      url: `/api/storage/uploads/${objectId}/content`,
      headers: {
        cookie: authentication.cookie,
        'x-csrf-token': authentication.csrf,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
  }

  it('keeps a stable Asset through upload and replacement and protects referenced deletion', async () => {
    const firstAuthorization = await authorize(
      {
        filename: 'hello.txt',
        contentType: 'text/plain',
        sizeBytes: 5,
        visibility: 'private',
        displayName: '说明文件',
      },
      'storage-create-0001',
    );
    expect(firstAuthorization.statusCode).toBe(200);
    const replay = await authorize(
      {
        filename: 'hello.txt',
        contentType: 'text/plain',
        sizeBytes: 5,
        visibility: 'private',
        displayName: '说明文件',
      },
      'storage-create-0001',
    );
    expect(replay.json().objectId).toBe(firstAuthorization.json().objectId);
    const uploaded = await upload(firstAuthorization.json().objectId, 'hello');
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({
      id: firstAuthorization.json().assetId,
      status: 'active',
      currentVersion: 1,
      mediaKind: 'text',
    });

    const content = await app.inject({
      method: 'GET',
      url: `/api/storage/assets/${uploaded.json().id}/content`,
      headers: { cookie: authentication.cookie },
    });
    expect(content.statusCode).toBe(200);
    expect(content.body).toBe('hello');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    const publicMissing = await app.inject({
      method: 'GET',
      url: `/api/assets/public/${uploaded.json().id}/content`,
    });
    expect(publicMissing.statusCode).toBe(404);

    const wrongMediaReplacement = await authorize(
      {
        filename: 'logo.png',
        contentType: 'image/png',
        sizeBytes: 68,
        expectedRevision: uploaded.json().revision,
      },
      'storage-replace-wrong-media-0001',
      uploaded.json().id,
    );
    expect(wrongMediaReplacement.statusCode).toBe(415);
    expect(wrongMediaReplacement.json().error.code).toBe('STORAGE_MEDIA_KIND_MISMATCH');

    const replacement = await authorize(
      {
        filename: 'hello.txt',
        contentType: 'text/plain',
        sizeBytes: 5,
        expectedRevision: uploaded.json().revision,
      },
      'storage-replace-0001',
      uploaded.json().id,
    );
    const replaced = await upload(replacement.json().objectId, 'world');
    expect(replaced.json()).toMatchObject({ id: uploaded.json().id, currentVersion: 2 });
    expect(await database.db.select().from(jobs)).toHaveLength(1);
    await expect(
      database.db
        .update(storageObjects)
        .set({ checksumSha256: '0'.repeat(64) })
        .where(eq(storageObjects.id, replacement.json().objectId)),
    ).rejects.toThrow();
    expect(
      (await database.db.select().from(storageObjects)).find(
        (object) => object.id === replacement.json().objectId,
      )?.checksumSha256,
    ).not.toBe('0'.repeat(64));

    await database.db.insert(storageAssetReferences).values({
      assetId: uploaded.json().id,
      ownerType: 'test.record',
      ownerId: 'record-1',
      field: 'attachment',
      createdBy: ownerId,
    });
    const blocked = await app.inject({
      method: 'DELETE',
      url: `/api/storage/assets/${uploaded.json().id}`,
      headers: { cookie: authentication.cookie, 'x-csrf-token': authentication.csrf },
      payload: { expectedRevision: replaced.json().revision },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('STORAGE_ASSET_IN_USE');

    await database.db.delete(storageAssetReferences);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/storage/assets/${uploaded.json().id}`,
      headers: { cookie: authentication.cookie, 'x-csrf-token': authentication.csrf },
      payload: { expectedRevision: replaced.json().revision },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await database.db.select().from(jobs)).toHaveLength(2);
    expect(
      (await database.db.select().from(storageObjects)).every((object) =>
        ['deletion_pending', 'deleted'].includes(object.status),
      ),
    ).toBe(true);
  });

  it('rejects forged content and does not expose provider internals', async () => {
    const authorization = await authorize(
      {
        filename: 'forged.txt',
        contentType: 'text/plain',
        sizeBytes: 4,
      },
      'storage-forged-0001',
    );
    const boundary = `storage-${crypto.randomUUID()}`;
    const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="forged.txt"\r\nContent-Type: text/plain\r\n\r\n`;
    const suffix = `\r\n--${boundary}--\r\n`;
    const response = await app.inject({
      method: 'POST',
      url: `/api/storage/uploads/${authorization.json().objectId}/content`,
      headers: {
        cookie: authentication.cookie,
        'x-csrf-token': authentication.csrf,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat([Buffer.from(prefix), Buffer.from([0, 1, 2, 3]), Buffer.from(suffix)]),
    });
    expect(response.statusCode).toBe(415);
    const persisted = await database.db.select().from(storageObjects);
    expect(persisted[0]?.status).toBe('failed');
    expect(await database.db.select().from(jobs)).toHaveLength(1);
    expect(JSON.stringify(response.json())).not.toContain('objectKey');
    expect(JSON.stringify(response.json())).not.toContain(storageRoot);
  });

  it('returns a stable 413 response when multipart content exceeds the configured limit', async () => {
    const authorization = await authorize(
      {
        filename: 'large.txt',
        contentType: 'text/plain',
        sizeBytes: 1024,
      },
      'storage-large-0001',
    );
    const response = await upload(authorization.json().objectId, 'x'.repeat(1025), 'large.txt');
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('STORAGE_FILE_TOO_LARGE');
  });
});
