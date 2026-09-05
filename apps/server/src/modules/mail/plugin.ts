import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import type { JobsService, JobHandlerDefinition, RecurringJobDefinition } from '../jobs/public.js';
import type { SettingsReader } from '../settings/public.js';
import { MailIdentityActionDelivery } from './application/identity-action-delivery.js';
import { MailService } from './application/mail.service.js';
import { registerMailRoutes } from './api/routes.js';
import {
  CORE_MAIL_TEMPLATES,
  MailTemplateRegistry,
  type MailTemplateDefinition,
} from './domain/template.registry.js';
import {
  ConfiguredMailProvider,
  type MailLogger,
} from './infrastructure/configured-mail.provider.js';
import { MailCipher } from './infrastructure/mail-cipher.js';
import { MailRepository } from './infrastructure/persistence/mail.repository.js';

export interface MailModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
  settings: SettingsReader;
  jobs: JobsService;
  logger: MailLogger;
  audit?: AuditWriter;
  templates?: MailTemplateDefinition[];
  service?: MailService;
}

export function createMailService(dependencies: MailModuleDependencies) {
  const templates = new MailTemplateRegistry([
    ...CORE_MAIL_TEMPLATES,
    ...(dependencies.templates ?? []),
  ]);
  const repository = new MailRepository(dependencies.database);
  const provider = new ConfiguredMailProvider(dependencies.settings, dependencies.logger);
  const service =
    dependencies.service ??
    new MailService(
      dependencies.database,
      repository,
      templates,
      new MailCipher(
        dependencies.environment.SETTINGS_ENCRYPTION_CURRENT_KEY_ID,
        dependencies.environment.SETTINGS_ENCRYPTION_KEYS,
      ),
      dependencies.jobs,
      provider,
      dependencies.settings,
      dependencies.audit ?? NOOP_AUDIT_WRITER,
    );
  const sendJobHandler: JobHandlerDefinition<{ deliveryId: string }> = {
    type: 'mail.send',
    queue: 'mail',
    payloadVersion: 1,
    payloadSchema: z.object({ deliveryId: z.uuid() }),
    maxAttempts: 5,
    leaseMs: 30_000,
    timeoutMs: 60_000,
    backoffBaseMs: 5_000,
    backoffMaxMs: 3_600_000,
    handler: (payload, context) =>
      service.sendDelivery(payload.deliveryId, context.attemptNumber, context.signal),
    classifyError: (error) => service.classifyFailure(error),
  };
  const cleanupJobHandler: JobHandlerDefinition<Record<string, never>> = {
    type: 'mail.cleanup',
    queue: 'maintenance',
    payloadVersion: 1,
    payloadSchema: z.object({}),
    maxAttempts: 3,
    leaseMs: 30_000,
    timeoutMs: 60_000,
    handler: async () => {
      await service.purgeTerminal(dependencies.environment.MAIL_RETENTION_DAYS);
    },
  };
  const recurringJob: RecurringJobDefinition = {
    key: 'mail.cleanup',
    intervalMs: dependencies.environment.MAIL_MAINTENANCE_INTERVAL_MS,
    type: 'mail.cleanup',
    payload: () => ({}),
    priority: -50,
  };
  return {
    templates,
    service,
    sendJobHandler,
    cleanupJobHandler,
    recurringJob,
    actionDelivery: new MailIdentityActionDelivery(service, dependencies.settings),
  };
}

export function createMailModule(dependencies: MailModuleDependencies): FastifyPluginAsync {
  return async (app) =>
    registerMailRoutes(app, dependencies.service ?? createMailService(dependencies).service);
}
