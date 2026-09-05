import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import { AuditService } from './application/audit.service.js';
import { registerAuditRoutes } from './api/routes.js';
import { AuditRepository } from './infrastructure/persistence/audit.repository.js';

export interface AuditModuleDependencies {
  database: DatabaseHandle;
  service?: AuditService;
}

export function createAuditService(dependencies: AuditModuleDependencies): AuditService {
  return new AuditService(new AuditRepository(dependencies.database));
}

export function createAuditModule(dependencies: AuditModuleDependencies): FastifyPluginAsync {
  return async (app) => {
    await registerAuditRoutes(app, dependencies.service ?? createAuditService(dependencies));
  };
}
