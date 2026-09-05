import type { FastifyPluginAsync } from 'fastify';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import {
  DisabledIdentityActionDelivery,
  type IdentityActionDelivery,
} from './application/action-delivery.port.js';
import { IdentityService } from './application/identity.service.js';
import { registerIdentityRoutes } from './api/routes.js';
import { IdentityRepository } from './infrastructure/persistence/identity.repository.js';

export interface IdentityModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
  actionDelivery?: IdentityActionDelivery;
  audit?: AuditWriter;
  service?: IdentityService;
}

export function createIdentityService(dependencies: IdentityModuleDependencies): IdentityService {
  return new IdentityService(
    new IdentityRepository(dependencies.database),
    dependencies.environment,
    dependencies.actionDelivery ?? new DisabledIdentityActionDelivery(),
    dependencies.audit ?? NOOP_AUDIT_WRITER,
  );
}

export function createIdentityModule(dependencies: IdentityModuleDependencies): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createIdentityService(dependencies);
    await registerIdentityRoutes(app, { environment: dependencies.environment, service });
  };
}
