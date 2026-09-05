import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import { JobHandlerRegistry } from './application/job-handler.registry.js';
import { JobsService } from './application/jobs.service.js';
import { RecurringJobRegistry } from './application/recurring-job.registry.js';
import { registerJobsRoutes } from './api/routes.js';
import type { JobHandlerDefinition, RecurringJobDefinition } from './domain/model.js';
import { JobsRepository } from './infrastructure/persistence/jobs.repository.js';
import { JobsRunner } from './workers/jobs-runner.js';

export interface JobsModuleDependencies {
  database: DatabaseHandle;
  audit?: AuditWriter;
  handlers?: JobHandlerDefinition[];
  recurringJobs?: RecurringJobDefinition[];
  registry?: JobHandlerRegistry;
  recurringRegistry?: RecurringJobRegistry;
  service?: JobsService;
}

export function createJobsService(dependencies: JobsModuleDependencies) {
  const registry = dependencies.registry ?? new JobHandlerRegistry(dependencies.handlers);
  const recurring =
    dependencies.recurringRegistry ?? new RecurringJobRegistry(dependencies.recurringJobs);
  return {
    registry,
    recurring,
    service:
      dependencies.service ??
      new JobsService(
        dependencies.database,
        registry,
        new JobsRepository(dependencies.database),
        dependencies.audit ?? NOOP_AUDIT_WRITER,
      ),
  };
}

export function createJobsRunner(
  dependencies: JobsModuleDependencies & { environment: AppEnvironment; logger: Logger },
) {
  const runtime = createJobsService(dependencies);
  return {
    ...runtime,
    runner: new JobsRunner(
      dependencies.environment,
      runtime.service,
      runtime.recurring,
      runtime.registry.queues(),
      dependencies.logger,
    ),
  };
}

export function createJobsModule(dependencies: JobsModuleDependencies): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createJobsService(dependencies).service;
    await registerJobsRoutes(app, service);
  };
}
