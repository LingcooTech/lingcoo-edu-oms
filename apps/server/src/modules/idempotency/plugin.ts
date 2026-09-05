import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import { IdempotencyService } from './application/idempotency.service.js';
import { registerIdempotencyRoutes } from './api/routes.js';
import { IdempotencyRepository } from './infrastructure/persistence/idempotency.repository.js';

export interface IdempotencyModuleDependencies {
  database: DatabaseHandle;
  service?: IdempotencyService;
}

export function createIdempotencyService(
  dependencies: Pick<IdempotencyModuleDependencies, 'database'>,
): IdempotencyService {
  return new IdempotencyService(
    dependencies.database,
    new IdempotencyRepository(dependencies.database),
  );
}

export function createIdempotencyModule(
  dependencies: IdempotencyModuleDependencies,
): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createIdempotencyService(dependencies);
    await registerIdempotencyRoutes(app, service);
  };
}
