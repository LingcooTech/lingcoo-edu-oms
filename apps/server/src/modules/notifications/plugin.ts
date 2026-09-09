import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { ApiError } from '@lingcoo-tech/http';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import type { JobsService, JobHandlerDefinition } from '../jobs/public.js';
import type { MailQueue } from '../mail/public.js';
import type { IdentityService } from '../identity/public.js';
import { AnnouncementService } from './application/announcement.service.js';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationDeliveryService,
} from './application/notification-delivery.service.js';
import { NotificationsService } from './application/notifications.service.js';
import { registerNotificationRoutes } from './api/routes.js';
import type { NotificationPreferenceResolver } from './domain/model.js';
import { NotificationsRepository } from './infrastructure/persistence/notifications.repository.js';

export interface NotificationsModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
  jobs: JobsService;
  mail: MailQueue;
  identity: Pick<IdentityService, 'getUser' | 'findUsersByIds' | 'listUsers'>;
  audit?: AuditWriter;
  preferences?: NotificationPreferenceResolver;
  service?: NotificationsService;
}

export function createNotificationsService(dependencies: NotificationsModuleDependencies) {
  const repository = new NotificationsRepository(dependencies.database);
  const recipients = {
    async findById(userId: string, transaction: Parameters<IdentityService['getUser']>[1]) {
      try {
        const user = await dependencies.identity.getUser(userId, transaction);
        return { id: user.id, email: user.email, status: user.status };
      } catch (error) {
        if (error instanceof ApiError && error.code === 'IDENTITY_USER_NOT_FOUND') return null;
        throw error;
      }
    },
    async listActive(limit: number) {
      const page = await dependencies.identity.listUsers({
        page: 1,
        pageSize: limit,
        status: 'active',
      });
      return page.items.map(({ id }) => ({ id })).sort((a, b) => a.id.localeCompare(b.id));
    },
    async findActiveByIds(userIds: string[]) {
      const users = await dependencies.identity.findUsersByIds(userIds);
      return users
        .filter((user) => user.status === 'active')
        .map(({ id }) => ({ id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    },
  };
  const delivery = new NotificationDeliveryService(
    dependencies.database,
    repository,
    recipients,
    dependencies.mail,
    dependencies.preferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
    dependencies.environment.APP_NAME,
  );
  const announcements = new AnnouncementService(
    dependencies.database,
    repository,
    dependencies.jobs,
    recipients,
    delivery,
    dependencies.audit ?? NOOP_AUDIT_WRITER,
  );
  const service = dependencies.service ?? new NotificationsService(delivery, announcements);
  const publishAnnouncementJobHandler: JobHandlerDefinition<{ announcementId: string }> = {
    type: 'notifications.publish-announcement',
    queue: 'notifications',
    payloadVersion: 1,
    payloadSchema: z.object({ announcementId: z.uuid() }),
    maxAttempts: 5,
    leaseMs: 30_000,
    timeoutMs: 120_000,
    backoffBaseMs: 5_000,
    backoffMaxMs: 3_600_000,
    handler: (payload, context) =>
      service.processAnnouncement(payload.announcementId, context.signal),
  };
  return { service, publishAnnouncementJobHandler };
}

export function createNotificationsModule(
  dependencies: NotificationsModuleDependencies,
): FastifyPluginAsync {
  return async (app) =>
    registerNotificationRoutes(
      app,
      dependencies.service ?? createNotificationsService(dependencies).service,
    );
}
