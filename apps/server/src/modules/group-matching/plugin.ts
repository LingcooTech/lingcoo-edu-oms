import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import { registerGroupMatchingRoutes } from './api/routes.js';
import { GroupMatchingService } from './application/group-matching.service.js';
import type {
  GroupMatchingPeopleDirectory,
  GroupMatchingResourceDirectory,
} from './domain/model.js';
import { GroupMatchingRepository } from './infrastructure/persistence/group-matching.repository.js';

export interface GroupMatchingDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  people: GroupMatchingPeopleDirectory;
  resources: GroupMatchingResourceDirectory;
  audit: AuditWriter;
  service?: GroupMatchingService;
}

export function createGroupMatchingService(dependencies: GroupMatchingDependencies) {
  return new GroupMatchingService(
    dependencies.database,
    new GroupMatchingRepository(dependencies.database),
    dependencies.institutions,
    dependencies.people,
    dependencies.resources,
    dependencies.audit,
  );
}

export function createGroupMatchingModule(
  dependencies: GroupMatchingDependencies,
): FastifyPluginAsync {
  return async (app) => {
    await registerGroupMatchingRoutes(
      app,
      dependencies.service ?? createGroupMatchingService(dependencies),
    );
  };
}
