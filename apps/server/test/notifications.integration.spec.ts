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
import { MailRepository } from '../src/modules/mail/infrastructure/persistence/mail.repository.js';
import {
  mailDeliveries,
  mailTemplateOverrides,
} from '../src/modules/mail/infrastructure/persistence/mail.schema.js';
import {
  createNotificationsService,
  NOTIFICATION_MAIL_TEMPLATES,
} from '../src/modules/notifications/public.js';
import {
  notificationAnnouncements,
  notificationAnnouncementTargets,
  notifications,
} from '../src/modules/notifications/infrastructure/persistence/notifications.schema.js';
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

suite('notifications PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let owner: { id: string; email: string };
  let member: { id: string; email: string };
  let ownerCookies: ReturnType<typeof cookies>;
  let memberCookies: ReturnType<typeof cookies>;

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
    owner = await identity.ensureBootstrapUser(
      'notifications-owner@example.com',
      'owner-secure-password',
    );
    member = await identity.ensureBootstrapUser(
      'notifications-member@example.com',
      'member-secure-password',
    );
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    ownerCookies = await login(owner.email, 'owner-secure-password');
    memberCookies = await login(member.email, 'member-secure-password');
  });

  beforeEach(async () => {
    await database.db.delete(notificationAnnouncementTargets);
    await database.db.delete(notifications);
    await database.db.delete(notificationAnnouncements);
    await database.db.delete(mailDeliveries);
    await database.db.delete(mailTemplateOverrides);
    await database.db.delete(jobs);
    await database.db.delete(systemSettings);
    await database.db.execute(sql`truncate table ${auditEvents}`);
  });

  afterAll(async () => {
    if (!database) return;
    await cleanup();
    await app.close();
  });

  async function login(email: string, password: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });
    return cookies(response.headers['set-cookie']);
  }

  async function cleanup() {
    await database.db.delete(notificationAnnouncementTargets);
    await database.db.delete(notifications);
    await database.db.delete(notificationAnnouncements);
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
    const settingsRegistry = createSettingsRegistry();
    for (const definition of MAIL_SETTINGS) settingsRegistry.register(definition);
    const settings = createSettingsService({
      database,
      environment,
      audit,
      registry: settingsRegistry,
    });
    const jobRuntime = createJobsService({ database, audit });
    const mail = createMailService({
      database,
      environment,
      settings: settings.service,
      jobs: jobRuntime.service,
      audit,
      logger: { info() {} },
      templates: NOTIFICATION_MAIL_TEMPLATES,
    });
    jobRuntime.registry.register(mail.sendJobHandler);
    const notificationRuntime = createNotificationsService({
      database,
      environment,
      jobs: jobRuntime.service,
      mail: mail.service,
      audit,
    });
    jobRuntime.registry.register(notificationRuntime.publishAnnouncementJobHandler);
    return { notifications: notificationRuntime.service, mail: mail.service };
  }

  it('creates a notification and optional mail intent atomically with concurrent content-safe deduplication', async () => {
    const service = runtime().notifications;
    const input = {
      recipientUserId: owner.id,
      category: 'billing.payment',
      level: 'success' as const,
      title: '支付成功',
      body: '订单已经支付。',
      sourceType: 'payment',
      sourceId: 'payment-1001',
      metadata: { orderId: 'order-1001' },
      deduplicationKey: 'payment:1001:succeeded',
      channels: ['in_app', 'email'] as const,
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        database.transaction((transaction) =>
          service.publish({ ...input, channels: [...input.channels] }, transaction),
        ),
      ),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.filter((result) => !result.deduplicated)).toHaveLength(1);
    expect(await database.db.select().from(notifications)).toHaveLength(1);
    expect(await database.db.select().from(mailDeliveries)).toHaveLength(1);
    expect(await database.db.select().from(jobs)).toHaveLength(1);
    const persisted = JSON.stringify({
      notifications: await database.db.select().from(notifications),
      deliveries: await database.db.select().from(mailDeliveries),
      jobs: await database.db.select().from(jobs),
    });
    expect(persisted).not.toContain('payment:1001:succeeded');
    expect(persisted).not.toContain('notifications-owner@example.com');

    await expect(
      database.transaction((transaction) =>
        service.publish({ ...input, body: '不同内容', channels: [...input.channels] }, transaction),
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'NOTIFICATION_DEDUPLICATION_CONFLICT' }),
    );

    await expect(
      database.transaction(async (transaction) => {
        await service.publish(
          { ...input, deduplicationKey: 'rollback-key', channels: ['in_app'] },
          transaction,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(
      database.transaction((transaction) =>
        service.publish(
          {
            ...input,
            channels: ['in_app'],
            deduplicationKey: 'oversized-metadata',
            metadata: { payload: 'x'.repeat(17_000) },
          },
          transaction,
        ),
      ),
    ).rejects.toThrow('通知业务元数据不能超过 16 KiB');
    expect(await database.db.select().from(notifications)).toHaveLength(1);
  });

  it('keeps unread counts exact and enforces recipient ownership and state transitions', async () => {
    const service = runtime().notifications;
    const ownerNotification = await database.transaction((transaction) =>
      service.publish(
        {
          recipientUserId: owner.id,
          category: 'account.security',
          title: '密码已修改',
          body: '你的登录密码已经修改。',
          sourceType: 'identity',
          sourceId: owner.id,
          deduplicationKey: 'identity:password-changed:1',
        },
        transaction,
      ),
    );
    const unread = await app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(unread.json()).toEqual({ count: 1 });
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/notifications/${ownerNotification.id}/actions/read`,
      headers: { cookie: memberCookies.cookie, 'x-csrf-token': memberCookies.csrf },
    });
    expect(forbidden.statusCode).toBe(404);
    const announcementsForbidden = await app.inject({
      method: 'GET',
      url: '/api/notifications/announcements',
      headers: { cookie: memberCookies.cookie },
    });
    expect(announcementsForbidden.statusCode).toBe(403);
    const read = await app.inject({
      method: 'POST',
      url: `/api/notifications/${ownerNotification.id}/actions/read`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
    });
    expect(read.json()).toMatchObject({ id: ownerNotification.id, status: 'read' });
    expect((await service.unreadCount(owner.id)).count).toBe(0);
    await expect(
      database.db
        .update(notifications)
        .set({ readAt: null })
        .where(eq(notifications.id, ownerNotification.id)),
    ).rejects.toThrow();
    const archived = await app.inject({
      method: 'POST',
      url: `/api/notifications/${ownerNotification.id}/actions/archive`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
    });
    expect(archived.json()).toMatchObject({ status: 'archived' });
    const defaultList = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(defaultList.json().items).toHaveLength(0);
    const archivedList = await app.inject({
      method: 'GET',
      url: '/api/notifications?status=archived&includeArchived=true',
      headers: { cookie: ownerCookies.cookie },
    });
    expect(archivedList.json().items).toHaveLength(1);
    expect(archivedList.body).not.toContain('deduplicationHash');
    expect(archivedList.body).not.toContain('mailDeliveryId');
  });

  it('snapshots and publishes announcements once, isolates mail failure, and withdraws without deleting facts', async () => {
    const service = runtime().notifications;
    const created = await app.inject({
      method: 'POST',
      url: '/api/notifications/announcements',
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: {
        title: '系统维护通知',
        body: '系统将在今晚进行维护。',
        level: 'warning',
        audience: { type: 'all_active_users' },
        channels: ['in_app', 'email'],
        deduplicationKey: 'announcement-maintenance-2026-09-01',
      },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ status: 'draft', revision: 1 });
    expect(created.body).not.toContain('deduplicationHash');
    const published = await app.inject({
      method: 'POST',
      url: `/api/notifications/announcements/${created.json().id}/actions/publish`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: { expectedRevision: 1 },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toMatchObject({
      status: 'publishing',
      recipientCount: 2,
      revision: 2,
    });
    await Promise.all([
      service.processAnnouncement(created.json().id, new AbortController().signal),
      service.processAnnouncement(created.json().id, new AbortController().signal),
    ]);
    const completed = await service.getAnnouncement(created.json().id);
    expect(completed).toMatchObject({
      status: 'published',
      recipientCount: 2,
      deliveredCount: 2,
      revision: 3,
    });
    expect(await database.db.select().from(notifications)).toHaveLength(2);
    await expect(
      database.db
        .update(notificationAnnouncements)
        .set({ recipientCount: 3 })
        .where(eq(notificationAnnouncements.id, created.json().id)),
    ).rejects.toThrow();
    const [target] = await database.db.select().from(notificationAnnouncementTargets);
    await expect(
      database.db
        .update(notificationAnnouncementTargets)
        .set({ deliveredAt: new Date() })
        .where(eq(notificationAnnouncementTargets.recipientUserId, target!.recipientUserId)),
    ).rejects.toThrow();
    expect(await database.db.select().from(mailDeliveries)).toHaveLength(2);
    await service.processAnnouncement(created.json().id, new AbortController().signal);
    expect(await database.db.select().from(notifications)).toHaveLength(2);

    const [delivery] = await database.db.select().from(mailDeliveries);
    const mailRepository = new MailRepository(database);
    await mailRepository.markSending(delivery!.id, 1);
    await mailRepository.markFailed(
      delivery!.id,
      { code: 'MAIL_TEST_FAILURE', message: '安全失败摘要', statusCode: 503, retryable: false },
      true,
    );
    expect(await database.db.select().from(notifications)).toHaveLength(2);

    const withdrawn = await app.inject({
      method: 'POST',
      url: `/api/notifications/announcements/${created.json().id}/actions/withdraw`,
      headers: { cookie: ownerCookies.cookie, 'x-csrf-token': ownerCookies.csrf },
      payload: { expectedRevision: 3 },
    });
    expect(withdrawn.json()).toMatchObject({ status: 'withdrawn', revision: 4 });
    expect((await service.unreadCount(owner.id)).count).toBe(0);
    expect((await service.unreadCount(member.id)).count).toBe(0);
    expect(await database.db.select().from(notifications)).toHaveLength(2);
    await expect(
      database.db
        .update(notifications)
        .set({ title: '篡改历史公告' })
        .where(eq(notifications.announcementId, created.json().id)),
    ).rejects.toThrow();
    expect(
      (await database.db.select().from(notifications)).every(
        (notification) => notification.title === '系统维护通知',
      ),
    ).toBe(true);
  });
});
