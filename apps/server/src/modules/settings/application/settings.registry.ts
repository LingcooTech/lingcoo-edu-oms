import { ApiError } from '@lingcoo-tech/http';
import { settingKeySchema } from '@lingcoo-edu-oms/contracts';

import { CORE_SETTINGS } from '../domain/core-settings.js';
import type { SettingDefinition, SettingsConnectionTester } from '../domain/model.js';

export class SettingsRegistry {
  private readonly definitions = new Map<string, SettingDefinition>();
  private readonly testers = new Map<string, SettingsConnectionTester>();

  constructor(definitions: SettingDefinition[] = CORE_SETTINGS) {
    for (const definition of definitions) this.register(definition);
  }

  register<T>(definition: SettingDefinition<T>): void {
    const key = settingKeySchema.parse(definition.key);
    if (this.definitions.has(key)) throw new Error(`Setting definition already registered: ${key}`);
    if (definition.kind === 'secret' && definition.defaultValue !== undefined) {
      throw new Error(`Secret setting cannot have a code default: ${key}`);
    }
    if (definition.defaultValue !== undefined) {
      const value = definition.schema.parse(definition.defaultValue);
      if (value === null || value === undefined) {
        throw new Error(`Setting default cannot be null or undefined: ${key}`);
      }
    }
    if (definition.control === 'select' && !definition.options?.length) {
      throw new Error(`Select setting requires options: ${key}`);
    }
    for (const option of definition.options ?? []) definition.schema.parse(option.value);
    this.definitions.set(key, definition as SettingDefinition);
  }

  registerConnectionTester(tester: SettingsConnectionTester): void {
    const key = settingKeySchema.parse(tester.key);
    if (this.testers.has(key)) throw new Error(`Setting tester already registered: ${key}`);
    if (tester.timeoutMs !== undefined && (tester.timeoutMs < 100 || tester.timeoutMs > 30_000)) {
      throw new Error(`Setting tester timeout must be between 100 and 30000ms: ${key}`);
    }
    for (const settingKey of tester.requiredSettings) this.get(settingKey);
    this.testers.set(key, { ...tester, key });
  }

  list(): SettingDefinition[] {
    return [...this.definitions.values()].sort(
      (left, right) =>
        (left.groupOrder ?? 100) - (right.groupOrder ?? 100) ||
        left.group.localeCompare(right.group) ||
        left.key.localeCompare(right.key),
    );
  }

  listConnectionTesters(): SettingsConnectionTester[] {
    return [...this.testers.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  get<T = unknown>(key: string): SettingDefinition<T> {
    const definition = this.definitions.get(key);
    if (!definition) throw new ApiError(404, 'SETTING_NOT_FOUND', '设置项未注册');
    return definition as SettingDefinition<T>;
  }

  getConnectionTester(key: string): SettingsConnectionTester {
    const tester = this.testers.get(key);
    if (!tester) throw new ApiError(404, 'SETTING_TEST_NOT_FOUND', '连接测试未注册');
    return tester;
  }
}
