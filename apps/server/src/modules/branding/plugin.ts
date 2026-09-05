import type { FastifyPluginAsync } from 'fastify';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import type { AssetLibraryService, AssetReferenceService } from '../storage/public.js';
import { BrandingService } from './application/branding.service.js';
import { registerBrandingRoutes } from './api/routes.js';
import { BrandingRepository } from './infrastructure/persistence/branding.repository.js';

export interface BrandingModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
  assets: AssetLibraryService;
  references: AssetReferenceService;
  audit?: AuditWriter;
  service?: BrandingService;
}

export function createBrandingService(dependencies: BrandingModuleDependencies) {
  return new BrandingService(
    dependencies.environment,
    dependencies.database,
    new BrandingRepository(dependencies.database),
    dependencies.references,
    dependencies.assets,
    dependencies.audit ?? NOOP_AUDIT_WRITER,
  );
}

export function createBrandingModule(dependencies: BrandingModuleDependencies): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createBrandingService(dependencies);
    await registerBrandingRoutes(app, service);
  };
}
