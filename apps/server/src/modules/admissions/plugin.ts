import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { IdempotencyService } from '../idempotency/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import type { StudentOnboardingDirectory } from '../people/public.js';
import { registerAdmissionsRoutes } from './api/routes.js';
import { AdmissionsService } from './application/admissions.service.js';
import type {
  AdmissionReservationPayerDirectory,
  AdmissionReservationPayments,
} from './domain/model.js';
import { AdmissionsRepository } from './infrastructure/persistence/admissions.repository.js';

export interface AdmissionsModuleDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  people: StudentOnboardingDirectory;
  payments: AdmissionReservationPayments;
  payers: AdmissionReservationPayerDirectory;
  idempotency: IdempotencyService;
  audit: AuditWriter;
  service?: AdmissionsService;
}

export function createAdmissionsService(dependencies: AdmissionsModuleDependencies) {
  return new AdmissionsService(
    dependencies.database,
    new AdmissionsRepository(dependencies.database),
    dependencies.institutions,
    dependencies.people,
    dependencies.payments,
    dependencies.payers,
    dependencies.idempotency,
    dependencies.audit,
  );
}

export function createAdmissionsModule(
  dependencies: AdmissionsModuleDependencies,
): FastifyPluginAsync {
  return async (app) =>
    registerAdmissionsRoutes(app, dependencies.service ?? createAdmissionsService(dependencies));
}
