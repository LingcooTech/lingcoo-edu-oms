import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import {
  OutboxEventRegistry,
  OutboxPublisherRegistry,
} from './application/outbox-publisher.registry.js';
import { OutboxAdminService } from './application/outbox-admin.service.js';
import { OutboxService } from './application/outbox.service.js';
import { registerOutboxRoutes } from './api/routes.js';
import type { OutboxEventDefinition, OutboxPublisherDefinition } from './domain/model.js';
import { OutboxAppendRepository } from './infrastructure/persistence/outbox-append.repository.js';
import { OutboxDiagnosticsRepository } from './infrastructure/persistence/outbox-diagnostics.repository.js';
import { OutboxRepository } from './infrastructure/persistence/outbox.repository.js';
import { OutboxRunner } from './workers/outbox-runner.js';

export interface OutboxModuleDependencies {
  database: DatabaseHandle;
  audit?: AuditWriter;
  events?: OutboxEventDefinition[];
  publishers?: OutboxPublisherDefinition[];
  eventRegistry?: OutboxEventRegistry;
  publisherRegistry?: OutboxPublisherRegistry;
  service?: OutboxService;
  adminService?: OutboxAdminService;
}

export function createOutboxService(dependencies: OutboxModuleDependencies) {
  const eventRegistry = dependencies.eventRegistry ?? new OutboxEventRegistry(dependencies.events);
  const publisherRegistry =
    dependencies.publisherRegistry ?? new OutboxPublisherRegistry(dependencies.publishers);
  const appendRepository = new OutboxAppendRepository();
  const repository = new OutboxRepository();
  return {
    eventRegistry,
    publisherRegistry,
    service:
      dependencies.service ??
      new OutboxService(
        dependencies.database,
        eventRegistry,
        publisherRegistry,
        appendRepository,
        repository,
      ),
    adminService:
      dependencies.adminService ??
      new OutboxAdminService(
        dependencies.database,
        repository,
        new OutboxDiagnosticsRepository(dependencies.database),
        dependencies.audit ?? NOOP_AUDIT_WRITER,
      ),
  };
}

export function createOutboxRunner(
  dependencies: OutboxModuleDependencies & { environment: AppEnvironment; logger: Logger },
) {
  const runtime = createOutboxService(dependencies);
  return {
    ...runtime,
    runner: new OutboxRunner(dependencies.environment, runtime.service, dependencies.logger),
  };
}

export function createOutboxModule(dependencies: OutboxModuleDependencies): FastifyPluginAsync {
  return async (app) => {
    const adminService =
      dependencies.adminService ?? createOutboxService(dependencies).adminService;
    await registerOutboxRoutes(app, adminService);
  };
}
