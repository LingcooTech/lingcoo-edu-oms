import type { FastifyInstance } from 'fastify';

import type { AppEnvironment } from '../config/environment.js';
import type { DatabaseHandle } from '../database/database.js';
import { applicationJobHandlers, applicationRecurringJobs } from '../job-definitions.js';
import { applicationOutboxEvents } from '../outbox-event-definitions.js';
import {
  createAccessControlModule,
  createAccessControlService,
  installAccessControlGuard,
} from './access-control/public.js';
import { createHealthModule } from './health/plugin.js';
import { createIdentityModule, createIdentityService } from './identity/plugin.js';
import { createAuditModule, createAuditService } from './audit/public.js';
import {
  createSettingsModule,
  createSettingsRegistry,
  createSettingsService,
} from './settings/public.js';
import { createIdempotencyModule, createIdempotencyService } from './idempotency/public.js';
import { createJobsModule, createJobsService } from './jobs/public.js';
import { createOutboxModule, createOutboxService } from './outbox/public.js';
import {
  createMailModule,
  createMailService,
  createSmtpConnectionTester,
  MAIL_SETTINGS,
} from './mail/public.js';
import {
  createNotificationsModule,
  createNotificationsService,
  NOTIFICATION_MAIL_TEMPLATES,
} from './notifications/public.js';
import {
  createStorageConnectionTester,
  createStorageModule,
  createStorageRuntime,
  STORAGE_SETTINGS,
} from './storage/public.js';
import { createBrandingModule, createBrandingService } from './branding/public.js';
import {
  createPaymentsModule,
  createPaymentsService,
  PAYMENT_SETTINGS,
} from './payments/public.js';

export interface ApplicationModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
}

export async function registerApplicationModules(
  app: FastifyInstance,
  dependencies: ApplicationModuleDependencies,
): Promise<void> {
  const audit = createAuditService({ database: dependencies.database });
  const settingsRegistry = createSettingsRegistry();
  for (const definition of MAIL_SETTINGS) settingsRegistry.register(definition);
  for (const definition of STORAGE_SETTINGS) settingsRegistry.register(definition);
  for (const definition of PAYMENT_SETTINGS) settingsRegistry.register(definition);
  const settings = createSettingsService({ ...dependencies, audit, registry: settingsRegistry });
  const idempotency = createIdempotencyService(dependencies);
  const jobs = createJobsService({
    database: dependencies.database,
    audit,
    handlers: applicationJobHandlers,
    recurringJobs: applicationRecurringJobs,
  });
  const mail = createMailService({
    ...dependencies,
    settings: settings.service,
    jobs: jobs.service,
    logger: app.log,
    audit,
    templates: NOTIFICATION_MAIL_TEMPLATES,
  });
  jobs.registry.register(mail.sendJobHandler);
  jobs.registry.register(mail.cleanupJobHandler);
  jobs.recurring.register(mail.recurringJob);
  const notifications = createNotificationsService({
    ...dependencies,
    jobs: jobs.service,
    mail: mail.service,
    audit,
  });
  jobs.registry.register(notifications.publishAnnouncementJobHandler);
  const storage = createStorageRuntime({
    ...dependencies,
    settings: settings.service,
    jobs: jobs.service,
    audit,
  });
  const branding = createBrandingService({
    ...dependencies,
    assets: storage.library,
    references: storage.references,
    audit,
  });
  const payments = createPaymentsService({
    database: dependencies.database,
    settings: settings.service,
    audit,
  });
  jobs.registry.register(storage.maintenance.deleteObjectJobHandler);
  jobs.registry.register(storage.maintenance.deleteRejectedObjectJobHandler);
  jobs.registry.register(storage.maintenance.cleanupPendingJobHandler);
  jobs.recurring.register(storage.maintenance.recurringJob);
  settings.registry.registerConnectionTester(createSmtpConnectionTester(settings.service));
  settings.registry.registerConnectionTester(createStorageConnectionTester(storage.providers));
  const identity = createIdentityService({
    ...dependencies,
    audit,
    actionDelivery: mail.actionDelivery,
  });
  const access = createAccessControlService({ database: dependencies.database, identity, audit });
  const outbox = createOutboxService({
    database: dependencies.database,
    audit,
    events: applicationOutboxEvents,
  });
  installAccessControlGuard(app, { environment: dependencies.environment, identity, access });
  await app.register(createHealthModule(dependencies));
  await app.register(createIdentityModule({ ...dependencies, audit, service: identity }));
  await app.register(
    createAccessControlModule({
      database: dependencies.database,
      identity,
      audit,
      service: access,
    }),
  );
  await app.register(createAuditModule({ database: dependencies.database, service: audit }));
  await app.register(
    createSettingsModule({
      ...dependencies,
      audit,
      registry: settings.registry,
      service: settings.service,
    }),
  );
  await app.register(
    createIdempotencyModule({ database: dependencies.database, service: idempotency }),
  );
  await app.register(
    createJobsModule({ database: dependencies.database, audit, service: jobs.service }),
  );
  await app.register(
    createOutboxModule({
      database: dependencies.database,
      audit,
      service: outbox.service,
      adminService: outbox.adminService,
    }),
  );
  await app.register(
    createMailModule({
      ...dependencies,
      settings: settings.service,
      jobs: jobs.service,
      logger: app.log,
      audit,
      service: mail.service,
    }),
  );
  await app.register(
    createNotificationsModule({
      ...dependencies,
      jobs: jobs.service,
      mail: mail.service,
      audit,
      service: notifications.service,
    }),
  );
  await app.register(
    createStorageModule({
      ...dependencies,
      settings: settings.service,
      jobs: jobs.service,
      audit,
      runtime: storage,
    }),
  );
  await app.register(
    createBrandingModule({
      ...dependencies,
      assets: storage.library,
      references: storage.references,
      audit,
      service: branding,
    }),
  );
  await app.register(
    createPaymentsModule({
      database: dependencies.database,
      settings: settings.service,
      audit,
      service: payments,
    }),
  );
}
