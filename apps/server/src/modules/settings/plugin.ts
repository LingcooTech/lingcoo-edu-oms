import type { FastifyPluginAsync } from 'fastify';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditWriter } from '../audit/public.js';
import { SettingsRegistry } from './application/settings.registry.js';
import { SettingsService } from './application/settings.service.js';
import { registerSettingsRoutes } from './api/routes.js';
import type { SettingDefinition, SettingsConnectionTester } from './domain/model.js';
import { SettingsCipher } from './infrastructure/settings-cipher.js';
import { SettingsRepository } from './infrastructure/persistence/settings.repository.js';

export interface SettingsModuleDependencies {
  environment: AppEnvironment;
  database: DatabaseHandle;
  audit?: AuditWriter;
  definitions?: SettingDefinition[];
  connectionTesters?: SettingsConnectionTester[];
  registry?: SettingsRegistry;
  service?: SettingsService;
}

export function createSettingsRegistry(
  dependencies: Pick<SettingsModuleDependencies, 'definitions' | 'connectionTesters'> = {},
): SettingsRegistry {
  const registry = new SettingsRegistry(dependencies.definitions);
  for (const tester of dependencies.connectionTesters ?? []) {
    registry.registerConnectionTester(tester);
  }
  return registry;
}

export function createSettingsService(dependencies: SettingsModuleDependencies): {
  registry: SettingsRegistry;
  service: SettingsService;
} {
  const registry = dependencies.registry ?? createSettingsRegistry(dependencies);
  return {
    registry,
    service: new SettingsService(
      dependencies.database,
      dependencies.environment,
      registry,
      new SettingsCipher(
        dependencies.environment.SETTINGS_ENCRYPTION_CURRENT_KEY_ID,
        dependencies.environment.SETTINGS_ENCRYPTION_KEYS,
      ),
      new SettingsRepository(dependencies.database),
      dependencies.audit ?? NOOP_AUDIT_WRITER,
    ),
  };
}

export function createSettingsModule(dependencies: SettingsModuleDependencies): FastifyPluginAsync {
  return async (app) => {
    const service = dependencies.service ?? createSettingsService(dependencies).service;
    await registerSettingsRoutes(app, service);
  };
}
