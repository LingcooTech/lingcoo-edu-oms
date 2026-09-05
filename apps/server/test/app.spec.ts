import { ApiError } from '@lingcoo-tech/http';

import { buildApp } from '../src/app.js';
import type { AppEnvironment } from '../src/config/environment.js';
import type { DatabaseHandle } from '../src/database/database.js';

const environment: AppEnvironment = {
  NODE_ENV: 'test',
  APP_NAME: 'starter-test',
  APP_VERSION: 'test',
  APP_PUBLIC_URL: undefined,
  API_HOST: '127.0.0.1',
  API_PORT: 8090,
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5438/test',
  API_DOCS_ENABLED: false,
  TRUST_PROXY: false,
  LOG_LEVEL: 'silent',
  JOBS_WORKER_ID: undefined,
  JOBS_POLL_INTERVAL_MS: 1_000,
  JOBS_CONCURRENCY: 5,
  JOBS_HEARTBEAT_INTERVAL_MS: 10_000,
  JOBS_SHUTDOWN_GRACE_MS: 30_000,
  JOBS_STALE_RECOVERY_BATCH: 100,
  JOBS_RETENTION_DAYS: 30,
  JOBS_MAINTENANCE_INTERVAL_MS: 3_600_000,
  OUTBOX_WORKER_ID: undefined,
  OUTBOX_POLL_INTERVAL_MS: 1_000,
  OUTBOX_CONCURRENCY: 5,
  OUTBOX_HEARTBEAT_INTERVAL_MS: 10_000,
  OUTBOX_SHUTDOWN_GRACE_MS: 30_000,
  OUTBOX_STALE_RECOVERY_BATCH: 100,
  OUTBOX_RETENTION_DAYS: 30,
  OUTBOX_MAINTENANCE_INTERVAL_MS: 3_600_000,
  AUTH_SESSION_TTL_SECONDS: 604_800,
  AUTH_ACTION_TOKEN_TTL_SECONDS: 3_600,
  AUTH_COOKIE_NAME: 'test_session',
  AUTH_CSRF_COOKIE_NAME: 'test_csrf',
  AUTH_COOKIE_SAME_SITE: 'lax',
  AUTH_COOKIE_SECURE: false,
  AUTH_EXPOSE_TEST_TOKENS: true,
  SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'test-v1',
  SETTINGS_ENCRYPTION_KEYS: {
    'test-v1': 'test-settings-key-must-be-at-least-32-characters',
  },
  SUPPORT_EMAIL: undefined,
  MAIL_TRANSPORT: undefined,
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_SECURE: undefined,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_FROM_ADDRESS: undefined,
  SMTP_FROM_NAME: undefined,
  STORAGE_PROVIDER: undefined,
  STORAGE_LOCAL_ROOT: '.data/test-storage',
  STORAGE_MAX_UPLOAD_BYTES: 25 * 1_024 * 1_024,
  STORAGE_UPLOAD_EXPIRY_SECONDS: 900,
  STORAGE_PENDING_RETENTION_HOURS: 24,
  STORAGE_MAINTENANCE_INTERVAL_MS: 3_600_000,
  STORAGE_S3_REGION: undefined,
  STORAGE_S3_ENDPOINT: undefined,
  STORAGE_S3_BUCKET: undefined,
  STORAGE_S3_ACCESS_KEY: undefined,
  STORAGE_S3_SECRET_KEY: undefined,
  STORAGE_S3_FORCE_PATH_STYLE: undefined,
  PAYMENTS_MOCK_APP_ID: undefined,
  PAYMENTS_MOCK_MERCHANT_ID: undefined,
  PAYMENTS_MOCK_SIGNING_SECRET: undefined,
  MAIL_RETENTION_DAYS: 30,
  MAIL_MAINTENANCE_INTERVAL_MS: 3_600_000,
  BOOTSTRAP_OWNER_EMAIL: undefined,
  BOOTSTRAP_OWNER_PASSWORD: undefined,
};

function fakeDatabase(options: { pingError?: Error } = {}) {
  let closed = false;
  const database = {
    db: {} as DatabaseHandle['db'],
    async transaction<T>(work: Parameters<DatabaseHandle['transaction']>[0]) {
      return work({} as Parameters<typeof work>[0]) as Promise<T>;
    },
    async ping() {
      if (options.pingError) throw options.pingError;
    },
    async close() {
      closed = true;
    },
  } satisfies DatabaseHandle;
  return { database, wasClosed: () => closed };
}

describe('application', () => {
  it('reports liveness and readiness with a request ID', async () => {
    const { database, wasClosed } = fakeDatabase();
    const app = await buildApp({ environment, database });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({ status: 'ok', info: { api: { status: 'up' } } });
    expect(live.headers['x-request-id']).toBeTruthy();

    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ok', info: { database: { status: 'up' } } });

    await app.close();
    expect(wasClosed()).toBe(true);
  });

  it('reports an unavailable database without failing liveness', async () => {
    const { database } = fakeDatabase({ pingError: new Error('database unavailable') });
    const app = await buildApp({ environment, database });

    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({
      status: 'error',
      error: { database: { status: 'down' } },
    });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    await app.close();
  });

  it('returns stable validation and application error contracts', async () => {
    const { database } = fakeDatabase();
    const app = await buildApp({ environment, database });
    app.post(
      '/api/example',
      {
        config: { access: { public: true } },
        schema: {
          body: {
            type: 'object',
            required: ['name'],
            additionalProperties: false,
            properties: { name: { type: 'string', minLength: 1 } },
          },
        },
      },
      async (request) => request.body,
    );
    app.get('/api/conflict', { config: { access: { public: true } } }, async () => {
      throw new ApiError(409, 'EXAMPLE_CONFLICT', 'Example conflict');
    });

    const invalid = await app.inject({ method: 'POST', url: '/api/example', payload: {} });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
    });
    expect(invalid.json().error.requestId).toBeTruthy();

    const conflict = await app.inject({ method: 'GET', url: '/api/conflict' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: 'EXAMPLE_CONFLICT', message: 'Example conflict' },
    });
    await app.close();
  });

  it('denies an API route that does not declare an access policy', async () => {
    const { database } = fakeDatabase();
    const app = await buildApp({ environment, database });
    app.get('/api/unclassified', async () => ({ exposed: true }));

    const response = await app.inject({ method: 'GET', url: '/api/unclassified' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ACCESS_POLICY_REQUIRED' } });
    await app.close();
  });
});
