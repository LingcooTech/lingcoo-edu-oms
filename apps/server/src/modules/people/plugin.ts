import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { IdentityService } from '../identity/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import { registerPeopleRoutes } from './api/routes.js';
import {
  PeopleService,
  type StudentLessonAccountProvisioner,
} from './application/people.service.js';
import { PeopleRepository } from './infrastructure/persistence/people.repository.js';

export interface PeopleServiceDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  identity: IdentityService;
  audit: AuditWriter;
  lessonAccounts: StudentLessonAccountProvisioner;
}

export function createPeopleService(dependencies: PeopleServiceDependencies) {
  return new PeopleService(
    dependencies.database,
    new PeopleRepository(dependencies.database),
    dependencies.institutions,
    dependencies.identity,
    dependencies.audit,
    dependencies.lessonAccounts,
  );
}

export function createPeopleModule(
  dependencies: PeopleServiceDependencies & { service?: PeopleService },
): FastifyPluginAsync {
  return async (app) => {
    await registerPeopleRoutes(app, dependencies.service ?? createPeopleService(dependencies));
  };
}
