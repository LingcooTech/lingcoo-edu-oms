import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { IdempotencyService } from '../idempotency/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import type { StudentDirectory } from '../people/public.js';
import { registerPeriodCardsRoutes } from './api/routes.js';
import { PeriodCardsService } from './application/period-cards.service.js';
import { PeriodCardsRepository } from './infrastructure/persistence/period-cards.repository.js';

export interface PeriodCardsDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  students: StudentDirectory;
  idempotency: IdempotencyService;
  audit: AuditWriter;
  service?: PeriodCardsService;
}

export function createPeriodCardsService(dependencies: PeriodCardsDependencies) {
  return new PeriodCardsService(
    dependencies.database,
    new PeriodCardsRepository(dependencies.database),
    dependencies.institutions,
    dependencies.students,
    dependencies.idempotency,
    dependencies.audit,
  );
}

export function createPeriodCardsModule(dependencies: PeriodCardsDependencies): FastifyPluginAsync {
  return async (app) => {
    await registerPeriodCardsRoutes(
      app,
      dependencies.service ?? createPeriodCardsService(dependencies),
    );
  };
}
