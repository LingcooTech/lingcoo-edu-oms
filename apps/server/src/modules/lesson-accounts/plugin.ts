import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { IdempotencyService } from '../idempotency/public.js';
import type { LessonPackageDirectory } from '../lesson-products/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import type { OutboxPort } from '../outbox/public.js';
import type { StudentDirectory } from '../people/public.js';
import { registerLessonAccountsRoutes } from './api/routes.js';
import { LessonAccountProvisioningService } from './application/lesson-account-provisioning.service.js';
import { LessonAccountsService } from './application/lesson-accounts.service.js';
import { LessonAccountsRepository } from './infrastructure/persistence/lesson-accounts.repository.js';

export interface LessonAccountsDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  students: StudentDirectory;
  packages: LessonPackageDirectory;
  idempotency: IdempotencyService;
  audit: AuditWriter;
  outbox: OutboxPort;
  service?: LessonAccountsService;
}

export interface LessonAccountProvisionerDependencies {
  database: DatabaseHandle;
  audit: AuditWriter;
}

export function createLessonAccountProvisioner(dependencies: LessonAccountProvisionerDependencies) {
  return new LessonAccountProvisioningService(
    new LessonAccountsRepository(dependencies.database),
    dependencies.audit,
  );
}

export function createLessonAccountsService(dependencies: LessonAccountsDependencies) {
  return new LessonAccountsService(
    dependencies.database,
    new LessonAccountsRepository(dependencies.database),
    dependencies.institutions,
    dependencies.students,
    dependencies.packages,
    dependencies.idempotency,
    dependencies.audit,
    dependencies.outbox,
  );
}

export function createLessonAccountsModule(
  dependencies: LessonAccountsDependencies,
): FastifyPluginAsync {
  return async (app) => {
    await registerLessonAccountsRoutes(
      app,
      dependencies.service ?? createLessonAccountsService(dependencies),
    );
  };
}
