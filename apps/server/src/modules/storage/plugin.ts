import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import type { JobQueue } from '../jobs/public.js';
import type { SettingsReader } from '../settings/public.js';
import { AssetLibraryService } from './application/asset-library.service.js';
import { AssetReferenceService } from './application/asset-reference.service.js';
import { AssetUploadService } from './application/asset-upload.service.js';
import { StorageMaintenanceService } from './application/storage-maintenance.service.js';
import { registerStorageRoutes } from './api/routes.js';
import { ConfiguredStorageProviderResolver } from './infrastructure/configured-storage.js';
import { AssetRepository } from './infrastructure/persistence/asset.repository.js';
import { StorageObjectRepository } from './infrastructure/persistence/storage-object.repository.js';

export interface StorageModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
  settings: SettingsReader;
  jobs: JobQueue;
  audit?: AuditWriter;
}

export type StorageRuntime = ReturnType<typeof createStorageRuntime>;

export function createStorageRuntime(dependencies: StorageModuleDependencies) {
  const assets = new AssetRepository(dependencies.database);
  const objects = new StorageObjectRepository(dependencies.database);
  const providers = new ConfiguredStorageProviderResolver(
    dependencies.environment,
    dependencies.settings,
  );
  const audit = dependencies.audit ?? NOOP_AUDIT_WRITER;
  const library = new AssetLibraryService(
    dependencies.database,
    assets,
    objects,
    providers,
    dependencies.jobs,
    audit,
  );
  const uploads = new AssetUploadService(
    dependencies.environment,
    dependencies.database,
    assets,
    objects,
    providers,
    dependencies.jobs,
    audit,
    library,
  );
  const references = new AssetReferenceService(dependencies.database, assets);
  const maintenance = new StorageMaintenanceService(
    dependencies.environment,
    dependencies.database,
    assets,
    objects,
    providers,
  );
  return { library, uploads, references, maintenance, providers };
}

export function createStorageModule(
  dependencies: StorageModuleDependencies & { runtime?: StorageRuntime },
): FastifyPluginAsync {
  return async (app) => {
    const runtime = dependencies.runtime ?? createStorageRuntime(dependencies);
    await app.register(async (storageApi) => {
      await storageApi.register(multipart, {
        limits: {
          files: 1,
          fields: 0,
          fileSize: dependencies.environment.STORAGE_MAX_UPLOAD_BYTES,
        },
      });
      await registerStorageRoutes(storageApi, {
        ...runtime,
        maxUploadBytes: dependencies.environment.STORAGE_MAX_UPLOAD_BYTES,
      });
    });
  };
}
