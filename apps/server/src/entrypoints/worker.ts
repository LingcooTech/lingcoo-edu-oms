import 'dotenv/config';

import pino from 'pino';

import { validateEnvironment } from '../config/environment.js';
import { createDatabase } from '../database/database.js';
import { applicationJobHandlers, applicationRecurringJobs } from '../job-definitions.js';
import { createJobsRunner } from '../modules/jobs/public.js';
import { createAuditService } from '../modules/audit/public.js';
import { createJobsService } from '../modules/jobs/public.js';
import { createMailService, MAIL_SETTINGS } from '../modules/mail/public.js';
import {
  createNotificationsService,
  NOTIFICATION_MAIL_TEMPLATES,
} from '../modules/notifications/public.js';
import { createSettingsRegistry, createSettingsService } from '../modules/settings/public.js';
import { createStorageRuntime, STORAGE_SETTINGS } from '../modules/storage/public.js';
import { createOutboxRunner } from '../modules/outbox/public.js';
import { applicationOutboxEvents } from '../outbox-event-definitions.js';
import { applicationOutboxPublishers } from '../outbox-publisher-definitions.js';

const environment = validateEnvironment(process.env);
const logger = pino({ level: environment.LOG_LEVEL }).child({
  app: environment.APP_NAME,
  process: 'worker',
  version: environment.APP_VERSION,
});
const database = createDatabase(environment.DATABASE_URL);

await database.ping();
const audit = createAuditService({ database });
const settingsRegistry = createSettingsRegistry();
for (const definition of MAIL_SETTINGS) settingsRegistry.register(definition);
for (const definition of STORAGE_SETTINGS) settingsRegistry.register(definition);
const settings = createSettingsService({
  database,
  environment,
  audit,
  registry: settingsRegistry,
});
const jobsRuntime = createJobsService({
  database,
  audit,
  handlers: applicationJobHandlers,
  recurringJobs: applicationRecurringJobs,
});
const mail = createMailService({
  database,
  environment,
  settings: settings.service,
  jobs: jobsRuntime.service,
  logger,
  audit,
  templates: NOTIFICATION_MAIL_TEMPLATES,
});
jobsRuntime.registry.register(mail.sendJobHandler);
jobsRuntime.registry.register(mail.cleanupJobHandler);
jobsRuntime.recurring.register(mail.recurringJob);
const notifications = createNotificationsService({
  database,
  environment,
  jobs: jobsRuntime.service,
  mail: mail.service,
  audit,
});
jobsRuntime.registry.register(notifications.publishAnnouncementJobHandler);
const storage = createStorageRuntime({
  database,
  environment,
  settings: settings.service,
  jobs: jobsRuntime.service,
  audit,
});
jobsRuntime.registry.register(storage.maintenance.deleteObjectJobHandler);
jobsRuntime.registry.register(storage.maintenance.deleteRejectedObjectJobHandler);
jobsRuntime.registry.register(storage.maintenance.cleanupPendingJobHandler);
jobsRuntime.recurring.register(storage.maintenance.recurringJob);
const { runner } = createJobsRunner({
  database,
  environment,
  logger,
  registry: jobsRuntime.registry,
  recurringRegistry: jobsRuntime.recurring,
  service: jobsRuntime.service,
});
const { runner: outboxRunner } = createOutboxRunner({
  database,
  environment,
  logger,
  events: applicationOutboxEvents,
  publishers: applicationOutboxPublishers,
});
runner.start();
outboxRunner.start();

await new Promise<void>((resolveShutdown) => {
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down worker');
    resolveShutdown();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
});

await Promise.all([runner.stop(), outboxRunner.stop()]);
await database.close();
