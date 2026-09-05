import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { IdentityService } from '../identity/public.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import { AccessControlService } from './application/access-control.service.js';
import { registerAccessControlRoutes } from './api/routes.js';
import { AccessControlRepository } from './infrastructure/persistence/access-control.repository.js';

export interface AccessControlModuleDependencies {
  database: DatabaseHandle;
  identity: IdentityService;
  audit?: AuditWriter;
  service?: AccessControlService;
}

export function createAccessControlService(
  dependencies: AccessControlModuleDependencies,
): AccessControlService {
  return new AccessControlService(
    new AccessControlRepository(dependencies.database),
    dependencies.identity,
    dependencies.database,
    dependencies.audit ?? NOOP_AUDIT_WRITER,
  );
}

export function createAccessControlModule(
  dependencies: AccessControlModuleDependencies,
): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createAccessControlService(dependencies);
    await registerAccessControlRoutes(app, service);
  };
}
