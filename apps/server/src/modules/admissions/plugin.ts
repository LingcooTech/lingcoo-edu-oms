import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import type { StudentOnboardingDirectory } from '../people/public.js';
import { registerAdmissionsRoutes } from './api/routes.js';
import { AdmissionsService } from './application/admissions.service.js';
import { AdmissionsRepository } from './infrastructure/persistence/admissions.repository.js';

export interface AdmissionsModuleDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  people: StudentOnboardingDirectory;
  audit: AuditWriter;
  service?: AdmissionsService;
}

export function createAdmissionsService(dependencies: AdmissionsModuleDependencies) {
  return new AdmissionsService(
    dependencies.database,
    new AdmissionsRepository(dependencies.database),
    dependencies.institutions,
    dependencies.people,
    dependencies.audit,
  );
}

export function createAdmissionsModule(
  dependencies: AdmissionsModuleDependencies,
): FastifyPluginAsync {
  return async (app) =>
    registerAdmissionsRoutes(app, dependencies.service ?? createAdmissionsService(dependencies));
}
