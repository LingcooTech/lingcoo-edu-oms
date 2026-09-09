import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AccessControlService } from '../access-control/public.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import { registerOrganizationRoutes } from './api/routes.js';
import { OrganizationService } from './application/organization.service.js';
import { OrganizationRepository } from './infrastructure/persistence/organization.repository.js';

export interface OrganizationModuleDependencies {
  database: DatabaseHandle;
  access: AccessControlService;
  audit?: AuditWriter;
  service?: OrganizationService;
}

export function createOrganizationService(dependencies: {
  database: DatabaseHandle;
  audit?: AuditWriter;
}) {
  return new OrganizationService(
    dependencies.database,
    new OrganizationRepository(dependencies.database),
    dependencies.audit ?? NOOP_AUDIT_WRITER,
  );
}

export function createOrganizationModule(
  dependencies: OrganizationModuleDependencies,
): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createOrganizationService(dependencies);
    await registerOrganizationRoutes(app, service, dependencies.access);
  };
}
