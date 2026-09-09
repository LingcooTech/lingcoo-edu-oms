import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import { registerLessonProductsRoutes } from './api/routes.js';
import { LessonProductsService } from './application/lesson-products.service.js';
import { LessonProductsRepository } from './infrastructure/persistence/lesson-products.repository.js';

export interface LessonProductsDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  audit: AuditWriter;
  service?: LessonProductsService;
}

export function createLessonProductsService(dependencies: LessonProductsDependencies) {
  return new LessonProductsService(
    dependencies.database,
    new LessonProductsRepository(dependencies.database),
    dependencies.institutions,
    dependencies.audit,
  );
}

export function createLessonProductsModule(
  dependencies: LessonProductsDependencies,
): FastifyPluginAsync {
  return async (app) => {
    await registerLessonProductsRoutes(
      app,
      dependencies.service ?? createLessonProductsService(dependencies),
    );
  };
}
