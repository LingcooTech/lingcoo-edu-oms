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
import { createAuditService } from '../src/modules/audit/public.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { createJobsService } from '../src/modules/jobs/public.js';
import { jobs } from '../src/modules/jobs/infrastructure/persistence/jobs.schema.js';
import { createMailService, MAIL_SETTINGS } from '../src/modules/mail/public.js';
import {
  mailDeliveries,
  mailTemplateOverrides,
} from '../src/modules/mail/infrastructure/persistence/mail.schema.js';
import { createSettingsRegistry, createSettingsService } from '../src/modules/settings/public.js';
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

suite('mail PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerCookies: ReturnType<typeof cookies>;

  beforeAll(async () => {
    environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      AUTH_EXPOSE_TEST_TOKENS: 'true',
      MAIL_TRANSPORT: 'capture',
      APP_PUBLIC_URL: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    });
    database = createDatabase(environment.DATABASE_URL);
    await cleanup();
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({ database, identity });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser(
      'mail-owner@example.com',
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
    await database.db.delete(mailDeliveries);
    await database.db.delete(mailTemplateOverrides);
    await database.db.delete(jobs);
    await database.db.delete(identityActionTokens);
    await database.db.delete(systemSettings);
    await database.db.execute(sql`truncate table ${auditEvents}`);
  });

  afterAll(async () => {
    if (!database) return;
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await database.db.delete(mailDeliveries);
    await database.db.delete(mailTemplateOverrides);
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

  function runtime() {
    const audit = createAuditService({ database });
    const registry = createSettingsRegistry();
    for (const definition of MAIL_SETTINGS) registry.register(definition);
    const settings = createSettingsService({ database, environment, audit, registry });
    const jobRuntime = createJobsService({ database, audit });
    const mail = createMailService({
      database,
      environment,
      settings: settings.service,
      jobs: jobRuntime.service,
      audit,
      logger: { info() {} },
    });
    jobRuntime.registry.register(mail.sendJobHandler);
    jobRuntime.registry.register(mail.cleanupJobHandler);
    return { mail: mail.service, jobs: jobRuntime.service };
  }

  it('commits identity token, delivery, and job atomically without persisting plaintext secrets', async () => {
    const requested = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'mail-owner@example.com' },
    });
    expect(requested.statusCode).toBe(200);
    const actionToken = requested.json().testToken as string;
    const [tokens, deliveries, queuedJobs, audits] = await Promise.all([
      database.db.select().from(identityActionTokens),
      database.db.select().from(mailDeliveries),
      database.db.select().from(jobs),
      database.db.select().from(auditEvents),
    ]);
    expect(tokens).toHaveLength(1);
    expect(deliveries).toHaveLength(1);
    expect(queuedJobs).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      status: 'queued',
      jobId: queuedJobs[0]?.id,
      recipientPreview: 'm***@example.com',
    });
    const persisted = JSON.stringify({ deliveries, queuedJobs, audits });
    expect(persisted).not.toContain(actionToken);
    expect(JSON.stringify({ deliveries, queuedJobs })).not.toContain('mail-owner@example.com');
    expect(queuedJobs[0]?.payload).toEqual({ deliveryId: deliveries[0]?.id });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/mail/deliveries/${deliveries[0]?.id}`,
      headers: { cookie: ownerCookies.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.body).not.toContain(actionToken);
    expect(detail.body).not.toContain('mail-owner@example.com');
    expect(detail.json()).not.toHaveProperty('encryptedEnvelope');
    expect(detail.json()).not.toHaveProperty('recipientHash');
    expect(detail.json()).not.toHaveProperty('deduplicationHash');
  });

  it('rolls back the complete queue operation and deduplicates concurrent business notifications', async () => {
    const { mail } = runtime();
    const input = {
      templateKey: 'system.test',
      to: 'recipient@example.com',
      variables: { applicationName: 'Test' },
      deduplicationKey: 'business-notification:42',
    };
    await expect(
      database.transaction(async (transaction) => {
        await mail.queue({ ...input, deduplicationKey: 'rollback' }, transaction);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await database.db.select().from(mailDeliveries)).toHaveLength(0);
    expect(await database.db.select().from(jobs)).toHaveLength(0);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        database.transaction((transaction) => mail.queue(input, transaction)),
      ),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => !result.deduplicated)).toHaveLength(1);
    expect(await database.db.select().from(mailDeliveries)).toHaveLength(1);
    expect(await database.db.select().from(jobs)).toHaveLength(1);
    expect(JSON.stringify(await database.db.select().from(mailDeliveries))).not.toContain(
      'business-notification:42',
    );
  });

  it('captures mail through the worker handler and manages versioned template overrides', async () => {
    const { mail, jobs: jobService } = runtime();
    const queued = await database.transaction((transaction) =>
      mail.queue(
        {
          templateKey: 'system.test',
          to: 'capture@example.com',
          variables: { applicationName: 'Capture' },
          deduplicationKey: 'capture:1',
        },
        transaction,
      ),
    );
    await mail.sendDelivery(queued.id, 1, new AbortController().signal);
    expect(await mail.getDelivery(queued.id)).toMatchObject({
      status: 'sent',
      transport: 'capture',
      simulated: true,
      attemptCount: 1,
    });
    const [job] = await database.db.select().from(jobs);
    expect(jobService.resolveHandler(job!).payload).toEqual({ deliveryId: queued.id });
    const pending = await database.transaction((transaction) =>
      mail.queue(
        {
          templateKey: 'system.test',
          to: 'pending@example.com',
          variables: { applicationName: 'Pending' },
          deduplicationKey: 'pending:1',
        },
        transaction,
      ),
    );
    const old = new Date('2020-01-01T00:00:00.000Z');
    await database.db
      .update(mailDeliveries)
      .set({ updatedAt: old })
      .where(eq(mailDeliveries.id, queued.id));
    await database.db
      .update(mailDeliveries)
      .set({ updatedAt: old })
      .where(eq(mailDeliveries.id, pending.id));
    expect(await mail.purgeTerminal(30)).toBe(1);
    expect((await database.db.select().from(mailDeliveries)).map((item) => item.id)).toEqual([
      pending.id,
    ]);

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/mail/templates/system.test',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: {
        expectedRevision: null,
        subjectTemplate: '{{applicationName}} Test',
        textTemplate: 'Hello {{applicationName}}',
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ overridden: true, revision: 1 });
    const stale = await app.inject({
      method: 'PUT',
      url: '/api/mail/templates/system.test',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: {
        expectedRevision: null,
        subjectTemplate: '{{applicationName}} Again',
        textTemplate: 'Again {{applicationName}}',
      },
    });
    expect(stale.statusCode).toBe(409);
  });
});
