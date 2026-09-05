import { expect, test, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/health/ready', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', info: { database: { status: 'up' } } }),
    });
  });
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
          email: 'owner@example.com',
          displayName: 'Bootstrap Owner',
          status: 'active',
          emailVerifiedAt: '2026-08-30T00:00:00.000Z',
          createdAt: '2026-08-30T00:00:00.000Z',
        },
        session: {
          id: '67f6711f-cebd-4035-9873-29bcd06f705f',
          expiresAt: '2026-09-06T00:00:00.000Z',
        },
        csrfToken: 'abcdefghijklmnopqrstuvwxyz123456',
      }),
    });
  });
  await page.route('**/api/access/permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        permissions: [
          'accounts.read',
          'accounts.manage',
          'roles.read',
          'roles.manage',
          'audit.read',
          'settings.read',
          'settings.manage',
          'idempotency.read',
          'jobs.read',
          'jobs.manage',
          'outbox.read',
          'outbox.manage',
          'mail.read',
          'mail.manage',
          'notifications.read',
          'notifications.manage',
          'storage.read',
          'storage.manage',
          'branding.read',
          'branding.manage',
          'payments.read',
          'payments.manage',
        ],
      }),
    });
  });
  await page.route('**/api/access/catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            key: 'accounts.read',
            source: 'core',
            group: '访问控制',
            name: '查看账号',
            description: '查看后台账号及其角色。',
          },
          {
            key: 'roles.read',
            source: 'core',
            group: '访问控制',
            name: '查看角色',
            description: '查看角色和权限目录。',
          },
        ],
      }),
    });
  });
  await page.route('**/api/access/roles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: '8b2082fd-c5c7-48d5-9d4d-aa415473b357',
            key: 'system.owner',
            name: 'Owner',
            description: '系统所有者',
            system: true,
            permissionCount: 15,
            userCount: 1,
            createdAt: '2026-08-30T00:00:00.000Z',
            updatedAt: '2026-08-30T00:00:00.000Z',
          },
        ],
      }),
    });
  });
  await page.route('**/api/access/users**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
            email: 'owner@example.com',
            displayName: 'Bootstrap Owner',
            status: 'active',
            emailVerifiedAt: '2026-08-30T00:00:00.000Z',
            createdAt: '2026-08-30T00:00:00.000Z',
            roles: [
              {
                id: '8b2082fd-c5c7-48d5-9d4d-aa415473b357',
                key: 'system.owner',
                name: 'Owner',
                system: true,
              },
            ],
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    });
  });
  await page.route('**/api/audit/events**', async (route) => {
    const event = {
      id: '0b84525e-a74f-4fc9-af28-4602bf0b305f',
      occurredAt: '2026-08-30T08:00:00.000Z',
      eventVersion: 1,
      redactionVersion: 1,
      category: 'access',
      actorType: 'user',
      actorId: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      actorLabel: 'Bootstrap Owner',
      action: 'access.role.created',
      resourceType: 'access.role',
      resourceId: '8b2082fd-c5c7-48d5-9d4d-aa415473b357',
      outcome: 'success',
      requestId: 'audit-e2e-request',
      correlationId: null,
      ipAddress: '127.0.0.1',
      userAgent: 'Playwright',
      changes: [{ field: 'name', before: null, after: 'Owner' }],
      metadata: {},
    };
    const detail = new URL(route.request().url()).pathname.endsWith(event.id);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail ? event : { items: [event], page: 1, pageSize: 20, total: 1 }),
    });
  });
  await page.route('**/api/idempotency/records**', async (route) => {
    const record = {
      id: '6f54dd84-ca70-4d17-bf80-ffaca336113c',
      scope: 'account:7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      operation: 'orders.create',
      keyPreview: 'orde…88b592fc',
      status: 'succeeded',
      attemptCount: 2,
      maxAttempts: 3,
      recoveryCount: 1,
      actorId: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      lockedUntil: null,
      expiresAt: '2026-09-07T08:00:00.000Z',
      createdAt: '2026-08-31T08:00:00.000Z',
      updatedAt: '2026-08-31T08:01:00.000Z',
      completedAt: '2026-08-31T08:01:00.000Z',
    };
    const detail = new URL(route.request().url()).pathname.endsWith(record.id);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        detail
          ? {
              ...record,
              requestHash: 'a'.repeat(64),
              requestHashVersion: 1,
              resultStored: true,
              resultSizeBytes: 48,
              lastError: null,
            }
          : { items: [record], page: 1, pageSize: 20, total: 1 },
      ),
    });
  });
  let jobStatus: 'dead' | 'queued' = 'dead';
  let jobMaxAttempts = 2;
  let jobManualRetries = 0;
  await page.route('**/api/jobs**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/actions/retry')) {
      jobStatus = 'queued';
      jobMaxAttempts += 1;
      jobManualRetries += 1;
    }
    const job = {
      id: '2f54dd84-ca70-4d17-bf80-ffaca336113c',
      type: 'notifications.email-send',
      queue: 'default',
      status: jobStatus,
      priority: 10,
      runAt: '2026-08-31T08:02:00.000Z',
      attemptCount: 2,
      maxAttempts: jobMaxAttempts,
      recoveryCount: 1,
      manualRetryCount: jobManualRetries,
      deduplicationPreview: 'orde…88b592fc',
      leaseExpiresAt: null,
      createdAt: '2026-08-31T08:00:00.000Z',
      updatedAt: '2026-08-31T08:01:00.000Z',
      completedAt: jobStatus === 'dead' ? '2026-08-31T08:01:00.000Z' : null,
      canRetry: jobStatus === 'dead',
      canCancel: jobStatus === 'queued',
    };
    const detail = url.pathname === `/api/jobs/${job.id}` || request.method() === 'POST';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        detail
          ? {
              ...job,
              payloadHash: 'b'.repeat(64),
              payloadVersion: 1,
              payloadSizeBytes: 128,
              lastError: {
                code: 'EMAIL_PROVIDER_UNAVAILABLE',
                message: '邮件服务暂时不可用',
                statusCode: 503,
                retryable: false,
              },
              attempts: [
                {
                  id: '4f54dd84-ca70-4d17-bf80-ffaca336113c',
                  attemptNumber: 2,
                  status: 'failed',
                  startedAt: '2026-08-31T08:00:30.000Z',
                  heartbeatAt: '2026-08-31T08:00:31.000Z',
                  finishedAt: '2026-08-31T08:01:00.000Z',
                  error: {
                    code: 'EMAIL_PROVIDER_UNAVAILABLE',
                    message: '邮件服务暂时不可用',
                    statusCode: 503,
                    retryable: false,
                  },
                },
              ],
            }
          : { items: [job], page: 1, pageSize: 20, total: 1 },
      ),
    });
  });
  let outboxStatus: 'dead' | 'pending' = 'dead';
  let outboxMaxAttempts = 2;
  let outboxReplayCount = 0;
  await page.route('**/api/outbox/events**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/actions/replay')) {
      outboxStatus = 'pending';
      outboxMaxAttempts += 1;
      outboxReplayCount += 1;
    }
    const event = {
      id: '8f54dd84-ca70-4d17-bf80-ffaca336113c',
      topic: 'payments.succeeded',
      eventVersion: 1,
      aggregateType: 'payment_intent',
      aggregateId: 'payment-1001',
      aggregateVersion: 3,
      status: outboxStatus,
      availableAt: '2026-08-31T08:02:00.000Z',
      attemptCount: 2,
      maxAttempts: outboxMaxAttempts,
      recoveryCount: 1,
      manualReplayCount: outboxReplayCount,
      deduplicationPreview: 'paym…88b592fc',
      leaseExpiresAt: null,
      occurredAt: '2026-08-31T08:00:00.000Z',
      publishedAt: null,
      createdAt: '2026-08-31T08:00:00.000Z',
      updatedAt: '2026-08-31T08:01:00.000Z',
      canReplay: outboxStatus === 'dead',
    };
    const detail = url.pathname === `/api/outbox/events/${event.id}` || request.method() === 'POST';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        detail
          ? {
              ...event,
              payloadHash: 'c'.repeat(64),
              payloadSizeBytes: 96,
              lastError: {
                code: 'BROKER_UNAVAILABLE',
                message: '消息代理暂时不可用',
                statusCode: 503,
                retryable: false,
              },
              attempts: [
                {
                  id: '9f54dd84-ca70-4d17-bf80-ffaca336113c',
                  attemptNumber: 2,
                  status: 'failed',
                  startedAt: '2026-08-31T08:00:30.000Z',
                  heartbeatAt: '2026-08-31T08:00:31.000Z',
                  finishedAt: '2026-08-31T08:01:00.000Z',
                  error: {
                    code: 'BROKER_UNAVAILABLE',
                    message: '消息代理暂时不可用',
                    statusCode: 503,
                    retryable: false,
                  },
                },
              ],
            }
          : { items: [event], page: 1, pageSize: 20, total: 1 },
      ),
    });
  });
  await page.route('**/api/mail/deliveries**', async (route) => {
    const delivery = {
      id: 'af54dd84-ca70-4d17-bf80-ffaca336113c',
      jobId: '2f54dd84-ca70-4d17-bf80-ffaca336113c',
      templateKey: 'identity.password-reset',
      templateVersion: 1,
      templateRevision: null,
      recipientPreview: 'o***@example.com',
      status: 'exhausted',
      transport: 'smtp',
      attemptCount: 5,
      simulated: false,
      sentAt: null,
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-09-01T08:05:00.000Z',
    };
    const pathname = new URL(route.request().url()).pathname.replace(/\/+$/, '');
    const collectionPath = '/api/mail/deliveries';
    const detailPath = `${collectionPath}/${delivery.id}`;
    const detail = pathname.endsWith(detailPath);
    if (!detail && !pathname.endsWith(collectionPath)) {
      throw new Error(`Unexpected mail delivery request path: ${pathname}`);
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        detail
          ? {
              ...delivery,
              contentHash: 'd'.repeat(64),
              providerMessageId: null,
              lastError: {
                code: 'MAIL_SMTP_REJECTED',
                message: 'SMTP 拒绝了邮件或配置无效',
                statusCode: 422,
                retryable: false,
              },
            }
          : { items: [delivery], page: 1, pageSize: 20, total: 1 },
      ),
    });
  });
  let templateRevision: number | null = null;
  await page.route('**/api/mail/templates**', async (route) => {
    const request = route.request();
    if (request.method() === 'PUT') templateRevision = (templateRevision ?? 0) + 1;
    if (request.method() === 'DELETE') templateRevision = null;
    const template = {
      key: 'system.test',
      name: '测试邮件',
      description: '管理员验证邮件投递链路时发送。',
      version: 1,
      revision: templateRevision,
      variables: ['applicationName'],
      subjectTemplate: '{{applicationName}} 邮件服务测试',
      textTemplate: '这是一封来自 {{applicationName}} 的测试邮件。',
      overridden: templateRevision !== null,
      updatedAt: templateRevision === null ? null : '2026-09-01T08:00:00.000Z',
      updatedBy: templateRevision === null ? null : '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        new URL(request.url()).pathname === '/api/mail/templates'
          ? { items: [template] }
          : template,
      ),
    });
  });
  await page.route('**/api/mail/actions/test', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'bf54dd84-ca70-4d17-bf80-ffaca336113c', deduplicated: false }),
    });
  });
  let notificationRead = false;
  let announcementStatus: 'draft' | 'publishing' = 'draft';
  let announcementRevision = 1;
  await page.route('**/api/notifications**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const now = '2026-09-01T08:00:00.000Z';
    const notification = {
      id: 'cf54dd84-ca70-4d17-bf80-ffaca336113c',
      category: 'system.release',
      level: 'info',
      title: '通知中心已启用',
      body: '站内通知与邮件投递现在采用相互隔离的事实记录。',
      ctaLabel: '查看说明',
      ctaUrl: '/notifications',
      sourceType: 'system_release',
      sourceId: 'stage-9',
      metadata: {},
      status: notificationRead ? 'read' : 'unread',
      readAt: notificationRead ? now : null,
      archivedAt: null,
      createdAt: now,
    };
    const announcement = {
      id: 'df54dd84-ca70-4d17-bf80-ffaca336113c',
      status: announcementStatus,
      audienceType: 'all_active_users',
      channels: ['in_app'],
      level: 'warning',
      title: '系统维护公告',
      body: '今晚将进行短时维护。',
      ctaLabel: null,
      ctaUrl: null,
      recipientCount: announcementStatus === 'draft' ? 0 : 1,
      deliveredCount: 0,
      revision: announcementRevision,
      createdBy: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
      publishedAt: null,
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
    };

    if (url.pathname === '/api/notifications/unread-count') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: notificationRead ? 0 : 1 }),
      });
      return;
    }
    if (url.pathname === '/api/notifications/actions/read-all' && request.method() === 'POST') {
      const changed = notificationRead ? 0 : 1;
      notificationRead = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updatedCount: changed }),
      });
      return;
    }
    if (url.pathname.endsWith('/actions/read') && request.method() === 'POST') {
      notificationRead = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...notification, status: 'read', readAt: now }),
      });
      return;
    }
    if (url.pathname.startsWith('/api/notifications/announcements')) {
      if (url.pathname.endsWith('/actions/publish') && request.method() === 'POST') {
        announcementStatus = 'publishing';
        announcementRevision += 1;
      }
      const isCollection = url.pathname === '/api/notifications/announcements';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isCollection
            ? { items: [announcement], page: 1, pageSize: 20, total: 1 }
            : { ...announcement, audience: { type: 'all_active_users' } },
        ),
      });
      return;
    }
    if (url.pathname === '/api/notifications') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [notification], page: 1, pageSize: 20, total: 1 }),
      });
      return;
    }
    await route.fallback();
  });
  let storageRevision = 2;
  const storageAsset = (name = '品牌说明') => ({
    id: 'ef54dd84-ca70-4d17-bf80-ffaca336113c',
    status: 'active',
    visibility: 'private',
    mediaKind: 'text',
    displayName: name,
    altText: null,
    currentVersion: 1,
    revision: storageRevision,
    provider: 'local',
    originalName: `${name}.txt`,
    contentType: 'text/plain',
    extension: 'txt',
    sizeBytes: 12,
    checksumSha256: 'e'.repeat(64),
    referenceCount: 0,
    contentUrl: '/api/storage/assets/ef54dd84-ca70-4d17-bf80-ffaca336113c/content',
    publicUrl: null,
    createdBy: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    deletedAt: null,
  });
  const brandingAsset = () => ({
    ...storageAsset('品牌 Logo'),
    id: 'df54dd84-ca70-4d17-bf80-ffaca336113c',
    mediaKind: 'image',
    altText: '品牌标识',
    originalName: 'logo.png',
    contentType: 'image/png',
    extension: 'png',
    sizeBytes: 68,
    checksumSha256: 'd'.repeat(64),
    contentUrl: '/api/storage/assets/df54dd84-ca70-4d17-bf80-ffaca336113c/content',
  });
  await page.route('**/api/storage/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/content') && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      return;
    }
    if (url.pathname.endsWith('/content') && request.method() === 'POST') {
      storageRevision += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...storageAsset('新素材'),
          versions: [
            {
              id: 'ff54dd84-ca70-4d17-bf80-ffaca336113c',
              version: 1,
              provider: 'local',
              status: 'ready',
              originalName: 'new.txt',
              contentType: 'text/plain',
              extension: 'txt',
              sizeBytes: 6,
              checksumSha256: 'f'.repeat(64),
              createdAt: '2026-09-01T08:00:00.000Z',
              readyAt: '2026-09-01T08:00:00.000Z',
              deletedAt: null,
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/storage/assets/upload-authorizations') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          assetId: storageAsset().id,
          objectId: 'ff54dd84-ca70-4d17-bf80-ffaca336113c',
          assetRevision: storageRevision,
          completed: false,
          upload: {
            method: 'POST',
            url: '/api/storage/uploads/ff54dd84-ca70-4d17-bf80-ffaca336113c/content',
            headers: {},
            expiresAt: '2026-09-01T09:00:00.000Z',
          },
        }),
      });
      return;
    }
    const detail = url.pathname === `/api/storage/assets/${storageAsset().id}`;
    const brandingDetail = url.pathname === `/api/storage/assets/${brandingAsset().id}`;
    const selectedAsset = brandingDetail ? brandingAsset() : storageAsset();
    const listAsset =
      url.searchParams.get('mediaKind') === 'image' ? brandingAsset() : storageAsset();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        detail || brandingDetail
          ? {
              ...selectedAsset,
              versions: [
                {
                  id: 'ff54dd84-ca70-4d17-bf80-ffaca336113c',
                  version: 1,
                  provider: 'local',
                  status: 'ready',
                  originalName: selectedAsset.originalName,
                  contentType: selectedAsset.contentType,
                  extension: selectedAsset.extension,
                  sizeBytes: selectedAsset.sizeBytes,
                  checksumSha256: selectedAsset.checksumSha256,
                  createdAt: '2026-09-01T08:00:00.000Z',
                  readyAt: '2026-09-01T08:00:00.000Z',
                  deletedAt: null,
                },
              ],
            }
          : { items: [listAsset], page: 1, pageSize: 20, total: 1 },
      ),
    });
  });
  let branding = {
    appName: 'Fastify Business',
    logoAssetId: null as string | null,
    faviconAssetId: null as string | null,
    primaryColor: '#1677ff',
    loginTitle: '登录管理后台',
    loginSubtitle: '使用部署管理员账号继续',
    logoUrl: null as string | null,
    faviconUrl: null as string | null,
    revision: 0,
    updatedAt: null as string | null,
  };
  await page.route('**/api/branding**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/branding/assets/')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      return;
    }
    if (request.method() === 'PUT' && url.pathname === '/api/branding') {
      const input = request.postDataJSON() as typeof branding;
      branding = {
        ...branding,
        ...input,
        logoUrl: input.logoAssetId ? `/api/branding/assets/logo?v=${'d'.repeat(16)}` : null,
        faviconUrl: input.faviconAssetId
          ? `/api/branding/assets/favicon?v=${'d'.repeat(16)}`
          : null,
        revision: branding.revision + 1,
        updatedAt: '2026-09-02T00:00:00.000Z',
      };
    }
    const body =
      url.pathname === '/api/branding/public'
        ? {
            appName: branding.appName,
            primaryColor: branding.primaryColor,
            loginTitle: branding.loginTitle,
            loginSubtitle: branding.loginSubtitle,
            logoUrl: branding.logoUrl,
            faviconUrl: branding.faviconUrl,
            revision: branding.revision,
          }
        : branding;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.route('**/api/payments/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const intent = {
      id: 'af54dd84-ca70-4d17-bf80-ffaca336113c',
      merchantReference: 'order-e2e-001',
      provider: 'mock',
      amountMinor: 12800,
      refundedAmountMinor: 0,
      currency: 'CNY',
      description: 'Playwright payment',
      status: 'pending',
      revision: 2,
      paidAt: null,
      closedAt: null,
      createdAt: '2026-09-02T08:00:00.000Z',
      updatedAt: '2026-09-02T08:01:00.000Z',
    };
    const transaction = {
      id: 'bf54dd84-ca70-4d17-bf80-ffaca336113c',
      intentId: intent.id,
      provider: 'mock',
      providerTransactionId: `mock_txn_${intent.id}`,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      status: 'pending',
      lastQueriedAt: null,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt,
    };
    const page = (items: unknown[]) => ({ items, page: 1, pageSize: 50, total: items.length });
    if (pathname === '/api/payments/transactions')
      return route.fulfill({ json: page([transaction]) });
    if (pathname === '/api/payments/callbacks') return route.fulfill({ json: page([]) });
    if (pathname === '/api/payments/refunds') return route.fulfill({ json: page([]) });
    if (pathname === '/api/payments/intents') return route.fulfill({ json: page([intent]) });
    return route.fulfill({ json: { ...intent, transactions: [transaction], refunds: [] } });
  });
  let localeSource: 'default' | 'database' = 'default';
  let localeVersion: number | null = null;
  let localeValue = 'zh-CN';
  await page.route('**/api/settings**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const setting = (input: {
      key: string;
      label: string;
      description: string;
      kind: 'public' | 'internal' | 'secret';
      control: 'text' | 'email' | 'url' | 'number' | 'boolean' | 'select';
      source: 'environment' | 'database' | 'default' | 'unset';
      configured: boolean;
      readOnly: boolean;
      version: number | null;
      value?: unknown;
      options?: Array<{ label: string; value: string | number }>;
    }) => ({
      group: input.key.startsWith('application.') ? 'application' : 'integrations',
      groupLabel: input.key.startsWith('application.') ? '应用信息' : '扩展能力',
      options: [],
      updatedAt: null,
      updatedBy: null,
      ...input,
    });

    if (request.method() === 'GET' && url.pathname === '/api/settings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            setting({
              key: 'application.name',
              label: '服务名称',
              description: '运行时服务标识和系统通知名称。',
              kind: 'public',
              control: 'text',
              source: 'environment',
              configured: true,
              readOnly: true,
              version: null,
              value: 'Business Starter',
            }),
            setting({
              key: 'application.locale',
              label: '默认语言',
              description: '页面和通知使用的默认语言。',
              kind: 'public',
              control: 'select',
              source: localeSource,
              configured: true,
              readOnly: false,
              version: localeVersion,
              value: localeValue,
              options: [
                { label: '简体中文', value: 'zh-CN' },
                { label: 'English', value: 'en-US' },
              ],
            }),
            setting({
              key: 'integrations.api-token',
              label: 'API Token',
              description: '验证敏感设置通用编辑能力。',
              kind: 'secret',
              control: 'text',
              source: 'database',
              configured: true,
              readOnly: false,
              version: 3,
            }),
          ],
          connectionTests: [
            {
              key: 'integrations.api-health',
              group: 'integrations',
              label: 'API 连接',
              description: '验证外部 API 可用性。',
              requiredSettings: ['integrations.api-token'],
            },
          ],
        }),
      });
      return;
    }
    if (request.method() === 'PUT' && url.pathname === '/api/settings/application.locale') {
      const payload = request.postDataJSON() as { value: string; expectedVersion: number | null };
      if (payload.expectedVersion !== localeVersion) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SETTING_VERSION_CONFLICT', message: '设置已被修改' },
          }),
        });
        return;
      }
      localeSource = 'database';
      localeVersion = (localeVersion ?? 0) + 1;
      localeValue = payload.value;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          setting({
            key: 'application.locale',
            label: '默认语言',
            description: '页面和通知使用的默认语言。',
            kind: 'public',
            control: 'select',
            source: localeSource,
            configured: true,
            readOnly: false,
            version: localeVersion,
            value: localeValue,
            options: [
              { label: '简体中文', value: 'zh-CN' },
              { label: 'English', value: 'en-US' },
            ],
          }),
        ),
      });
      return;
    }
    if (
      request.method() === 'POST' &&
      url.pathname === '/api/settings/tests/integrations.api-health'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          message: '连接正常',
          testedAt: '2026-08-31T00:00:00.000Z',
        }),
      });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/settings/actions/rotate-secrets') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rotated: 1 }),
      });
      return;
    }
    await route.fallback();
  });
});

test('redirects an unauthenticated visitor to the login page', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AUTHENTICATION_REQUIRED', message: '请先登录' },
      }),
    });
  });
  await page.goto('/admin/');

  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: '登录管理后台' })).toBeVisible();
  await expect(page.getByLabel('邮箱')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  expect(browserErrors.get(page)).toEqual([
    'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
  ]);
  browserErrors.set(page, []);
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

test('renders the Admin foundation and navigates to the showcase', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/admin/');

  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  await expect(page.getByText('运行正常')).toBeVisible();

  if (page.viewportSize() && page.viewportSize()!.width < 992) {
    await page.getByRole('button', { name: '打开导航' }).click();
  }
  await page.getByRole('menuitem', { name: /组件示例/ }).click();
  await expect(page.getByRole('heading', { name: 'UI 基础展示' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('columnheader', { name: '边界' })).toBeVisible();
});

test('supports refreshing a deep Admin route', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/admin/showcase');
  await expect(page.getByRole('heading', { name: 'UI 基础展示' })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'UI 基础展示' })).toBeVisible({
    timeout: 20_000,
  });
});

test('renders role and account management as complete permission-aware pages', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/admin/access/roles');
  await expect(page.getByRole('heading', { name: '角色与权限' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Owner', { exact: true })).toBeVisible();
  await expect(page.getByText('系统角色', { exact: true })).toBeVisible();

  await page.goto('/admin/access/users');
  await expect(page.getByRole('heading', { name: '账号管理' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('owner@example.com')).toBeVisible();
  await expect(page.getByText('正常', { exact: true })).toBeVisible();
});

test('renders searchable audit logs and a read-only event detail', async ({ page }) => {
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('access.role.created', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '详情' }).click({ force: true });
  const detail = page.locator('.audit-detail-drawer');
  await expect(detail).toBeVisible();
  await expect(detail.getByText('audit-e2e-request', { exact: true })).toBeVisible();
  await expect(detail.getByText('变更摘要', { exact: true })).toBeVisible();
});

test('manages settings with source visibility, secret protection, and connection tests', async ({
  page,
}) => {
  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: '系统设置' })).toBeVisible({ timeout: 20_000 });
  const applicationName = page.locator('[data-setting-key="application.name"]');
  await expect(applicationName.getByText('环境变量', { exact: true })).toBeVisible();
  await expect(applicationName.getByText('请在部署环境中修改')).toBeVisible();
  await expect(applicationName.getByRole('button', { name: '保存' })).toHaveCount(0);

  const locale = page.locator('[data-setting-key="application.locale"]');
  await locale.locator('.ant-select').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await locale.getByRole('button', { name: '保存' }).click();
  await expect(locale.getByText('管理后台', { exact: true })).toBeVisible();
  await expect(locale.getByRole('button', { name: '恢复默认来源' })).toBeVisible();

  const secret = page.locator('[data-setting-key="integrations.api-token"]');
  await expect(secret.getByText('敏感', { exact: true })).toBeVisible();
  await expect(secret.getByPlaceholder('已配置；输入完整新值以替换')).toHaveValue('');

  await page.getByRole('button', { name: '测试连接' }).click();
  await expect(page.getByText('连接正常')).toBeVisible();
});

test('renders read-only idempotency diagnostics without exposing stored results', async ({
  page,
}) => {
  await page.goto('/admin/idempotency');
  await expect(page.getByRole('heading', { name: '幂等诊断' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('orders.create', { exact: true })).toBeVisible();
  await expect(page.getByText('已成功', { exact: true })).toBeVisible();
  await expect(page.getByText('诊断页不提供强制成功、删除或重新执行操作')).toBeVisible();

  await page.getByRole('button', { name: '详情' }).click({ force: true });
  const detail = page.locator('.idempotency-detail-drawer');
  await expect(detail).toBeVisible();
  await expect(detail.getByText('幂等记录详情', { exact: true })).toBeVisible();
  await expect(detail.getByText('Request Hash v1', { exact: true })).toBeVisible();
  await expect(detail.getByText(/已安全保存（48 bytes），不通过诊断 API 展示/)).toBeVisible();
  await expect(detail.getByRole('button', { name: /删除|重试|强制成功/ })).toHaveCount(0);
});

test('diagnoses and manually retries jobs without exposing worker internals or payloads', async ({
  page,
}) => {
  await page.goto('/admin/jobs');
  await expect(page.getByRole('heading', { name: '后台任务' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('notifications.email-send', { exact: true })).toBeVisible();
  await expect(page.getByText('死信', { exact: true })).toBeVisible();
  await expect(page.getByText('诊断接口不会返回 Payload、Worker ID 或 Claim Token')).toBeVisible();

  await page.getByRole('button', { name: '详情' }).click({ force: true });
  const detail = page.locator('.job-detail-drawer');
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Payload Hash', { exact: true })).toBeVisible();
  await expect(
    detail.getByText('EMAIL_PROVIDER_UNAVAILABLE', { exact: false }).first(),
  ).toBeVisible();
  await expect(detail.getByText(/worker-test|claim-token|customer@example\.com/i)).toHaveCount(0);

  await detail.getByRole('button', { name: '重试' }).click();
  await page.getByRole('button', { name: '确认重试' }).click();
  await expect(page.getByText('Job 已重新入队')).toBeVisible();
  await expect(detail.getByText('排队中', { exact: true })).toBeVisible();
});

test('diagnoses and replays dead outbox events without exposing immutable payloads', async ({
  page,
}) => {
  await page.goto('/admin/outbox');
  await expect(page.getByRole('heading', { name: 'Outbox 事件' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('payments.succeeded', { exact: true })).toBeVisible();
  await expect(page.getByText('事件事实不可修改，发布语义为 at-least-once')).toBeVisible();
  await page.getByRole('button', { name: '详情' }).click({ force: true });
  const detail = page.locator('.outbox-detail-drawer');
  await expect(detail).toBeVisible();
  await expect(detail.getByText('Payload Hash', { exact: true })).toBeVisible();
  await expect(detail.getByText(/claim-token|publisher-test|customer@example\.com/i)).toHaveCount(
    0,
  );
  await detail.getByRole('button', { name: '重放' }).click();
  await page.getByRole('button', { name: '确认重放' }).click();
  await expect(page.getByText('Outbox Event 已重新排队')).toBeVisible();
  await expect(detail.getByText('待发布', { exact: true })).toBeVisible();
});

test('manages safe mail templates, deliveries, and queued test mail', async ({ page }) => {
  await page.goto('/admin/mail');
  await expect(page.getByRole('heading', { name: '邮件服务' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('identity.password-reset', { exact: true })).toBeVisible();
  await expect(page.getByText('o***@example.com', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '详情' }).click({ force: true });
  const drawer = page.locator('.mail-delivery-detail-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('MAIL_SMTP_REJECTED', { exact: false })).toBeVisible();
  await expect(drawer.getByText(/top-secret|owner@example\.com|<html>/i)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: '邮件模板' }).click();
  await expect(page.getByText('system.test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '编辑' }).click({ force: true });
  await expect(page.getByText('不支持 HTML、Helper 或逻辑表达式')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: '测试邮件' }).click();
  await page.getByLabel('收件邮箱').fill('test@example.com');
  await page.getByRole('button', { name: '发送测试邮件' }).click();
  await expect(page.getByText('测试邮件已进入队列')).toBeVisible();
});

test('reads personal notifications and publishes an announcement asynchronously', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/admin/notifications');
  await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('通知中心已启用', { exact: true })).toBeVisible();
  await expect(page.locator('.ant-badge-count')).toHaveText('1');

  await page.getByRole('button', { name: '标记已读' }).click();
  await expect(page.getByText('已读', { exact: true })).toBeVisible();
  await expect(page.locator('.ant-badge-count')).toHaveCount(0);

  await page.getByRole('tab', { name: '公告管理' }).click();
  await expect(page.getByText('系统维护公告', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '发布' }).click();
  await page.getByRole('button', { name: '确认发布' }).click();
  await expect(page.getByText('公告已进入异步发布队列')).toBeVisible();
  await expect(page.getByText('发布中', { exact: true })).toBeVisible();
});

test('browses and uploads reusable assets without exposing provider locations', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/admin/storage');
  await expect(page.getByRole('heading', { name: '素材库' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('品牌说明', { exact: true })).toBeVisible();
  await page.getByText('品牌说明', { exact: true }).click();
  const drawer = page.locator('.storage-asset-detail-drawer');
  await expect(drawer.getByText('素材详情', { exact: true })).toBeVisible();
  await expect(drawer.getByText('ef54dd84-ca70-4d17-bf80-ffaca336113c')).toBeVisible();
  await expect(drawer.getByText(/bucket|object.?key|\/app\/data\/storage/i)).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'new.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('新素材'),
    });
  await expect(page.getByText('素材上传完成')).toBeVisible();
});

test('manages application branding with stable asset references and a live theme', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/admin/branding');
  await expect(page.getByRole('heading', { name: '应用品牌' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('界面展示名称').fill('Lingcoo Console');
  await page.getByLabel('品牌主色').fill('#722ed1');
  await page.getByLabel('登录页标题').fill('欢迎回来');

  await page
    .getByRole('button', { name: /选择素材/ })
    .first()
    .click();
  await expect(page.getByText('从素材库选择', { exact: true })).toBeVisible();
  await page.getByText('品牌 Logo', { exact: true }).click();
  await page.getByRole('button', { name: /保存品牌设置/ }).click();

  await expect(page.getByText('应用品牌已更新')).toBeVisible();
  await expect(page.locator('.admin-header').getByText('Lingcoo Console 管理后台')).toBeVisible();
  await expect(page).toHaveTitle('Lingcoo Console 管理后台');
  await expect(page.getByText(/bucket|object.?key|\/app\/data\/storage/i)).toHaveCount(0);
  const brandedButtonColor = await page
    .getByRole('button', { name: /保存品牌设置/ })
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(brandedButtonColor).not.toBe('rgb(22, 119, 255)');
});

test('reviews payment intents and runs a controlled reconciliation', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/admin/payments');
  await expect(page.getByRole('heading', { name: '支付与对账' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('order-e2e-001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '详情' }).click();
  await expect(page.getByText('Playwright payment', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '对账' }).click();
  await expect(
    page.locator('.ant-modal-confirm-title').filter({ hasText: '立即向 Provider 查询并对账？' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '确认对账' }).click();
  await expect(page.getByText('对账完成')).toBeVisible();
});

test('hides protected navigation when the account has no matching permission', async ({ page }) => {
  await page.route('**/api/access/permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ permissions: [] }),
    });
  });
  await page.goto('/admin/');
  if (page.viewportSize() && page.viewportSize()!.width < 992) {
    await page.getByRole('button', { name: '打开导航' }).click();
  }
  await expect(page.getByRole('menuitem', { name: /账号管理/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /角色与权限/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /审计日志/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /系统设置/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /幂等诊断/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /后台任务/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /Outbox 事件/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /邮件服务/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /素材库/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /应用品牌/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /支付与对账/ })).toHaveCount(0);
});
