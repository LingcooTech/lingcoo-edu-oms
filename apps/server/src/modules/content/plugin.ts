import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { ContentSourcesService } from '../content-sources/public.js';
import { registerContentRoutes } from './api/routes.js';
import { ContentService } from './application/content.service.js';
import { ContentRepository } from './infrastructure/persistence/content.repository.js';

export interface ContentModuleDependencies {
  database: DatabaseHandle;
  contentSources: ContentSourcesService;
  audit: AuditWriter;
  service?: ContentService;
}

export function createContentService(dependencies: ContentModuleDependencies) {
  return new ContentService(
    dependencies.database,
    new ContentRepository(dependencies.database),
    dependencies.contentSources.notion,
    dependencies.audit,
  );
}

export function createContentModule(dependencies: ContentModuleDependencies): FastifyPluginAsync {
  return async (app) =>
    registerContentRoutes(app, dependencies.service ?? createContentService(dependencies));
}
