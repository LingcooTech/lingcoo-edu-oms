import { ApiError } from '@lingcoo-tech/http';
import {
  settingConnectionTestResultSchema,
  type ClearSettingRequest,
  type SaveSettingRequest,
  type SettingConnectionTestResult,
  type SettingView,
} from '@lingcoo-edu-oms/contracts';
import { z } from 'zod';

import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { ResolvedSetting, SettingDefinition, SettingsReader } from '../domain/model.js';
import type { SettingsCipher } from '../infrastructure/settings-cipher.js';
import type { SettingsRepository } from '../infrastructure/persistence/settings.repository.js';
import type { SettingsRegistry } from './settings.registry.js';

type StoredSetting = NonNullable<Awaited<ReturnType<SettingsRepository['find']>>>;
type ActorContext = AuditContext & { actorId: string };

export class SettingsService implements SettingsReader {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly environment: Readonly<Record<string, unknown>>,
    private readonly registry: SettingsRegistry,
    private readonly cipher: SettingsCipher,
    private readonly repository: SettingsRepository,
    private readonly audit: AuditWriter,
  ) {}

  async list(): Promise<{
    items: SettingView[];
    connectionTests: Array<{
      key: string;
      group: string;
      label: string;
      description: string;
      requiredSettings: string[];
    }>;
  }> {
    const records = new Map(
      (await this.repository.findAll()).map((record) => [record.key, record]),
    );
    return {
      items: this.registry
        .list()
        .map((definition) => this.toView(definition, records.get(definition.key) ?? null)),
      connectionTests: this.registry.listConnectionTesters().map((tester) => ({
        key: tester.key,
        group: tester.group,
        label: tester.label,
        description: tester.description,
        requiredSettings: tester.requiredSettings,
      })),
    };
  }

  async publicValues(): Promise<Record<string, unknown>> {
    const records = new Map(
      (await this.repository.findAll()).map((record) => [record.key, record]),
    );
    return Object.fromEntries(
      this.registry
        .list()
        .filter((definition) => definition.kind === 'public')
        .map((definition) => {
          const resolved = this.resolve(definition, records.get(definition.key) ?? null);
          return [definition.key, resolved.value] as const;
        })
        .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined),
    );
  }

  async getValue<T = unknown>(key: string): Promise<T | undefined> {
    const definition = this.registry.get<T>(key);
    return this.resolve(definition, await this.repository.find(key)).value;
  }

  async save(key: string, input: SaveSettingRequest, context: ActorContext): Promise<SettingView> {
    const definition = this.registry.get(key);
    this.assertDatabaseMutable(definition);
    const value = this.validate(definition, input.value);
    const stored =
      definition.kind === 'secret'
        ? { value: null, ...this.cipher.encrypt(value) }
        : { value, encryptedValue: null, encryptionKeyId: null };

    const updated = await this.database.transaction(async (transaction) => {
      const beforeRecord = await this.repository.find(key, transaction);
      const record = await this.repository.save(
        key,
        stored,
        context.actorId,
        input.expectedVersion,
        transaction,
      );
      if (!record) this.versionConflict();
      const changes =
        definition.kind === 'secret'
          ? [
              {
                field: 'configured',
                before: this.resolveSecretView(definition, beforeRecord).source !== 'unset',
                after: true,
              },
              { field: 'version', before: beforeRecord?.version ?? null, after: record.version },
            ]
          : [
              {
                field: 'value',
                before: this.resolve(definition, beforeRecord).value ?? null,
                after: value,
              },
              {
                field: 'source',
                before: this.resolve(definition, beforeRecord).source,
                after: 'database',
              },
            ];
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'settings.setting.updated',
          resourceType: 'system.setting',
          resourceId: key,
          changes,
          metadata: { kind: definition.kind, version: record.version },
        },
        transaction,
      );
      return record;
    });
    return this.toView(definition, updated);
  }

  async clear(
    key: string,
    input: ClearSettingRequest,
    context: ActorContext,
  ): Promise<SettingView> {
    const definition = this.registry.get(key);
    this.assertDatabaseMutable(definition);
    await this.database.transaction(async (transaction) => {
      const before = await this.repository.find(key, transaction);
      const removed = await this.repository.clear(key, input.expectedVersion, transaction);
      if (!removed || !before) this.versionConflict();
      const fallback = this.resolve(definition, null);
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'settings.setting.cleared',
          resourceType: 'system.setting',
          resourceId: key,
          changes:
            definition.kind === 'secret'
              ? [
                  {
                    field: 'configured',
                    before: true,
                    after: fallback.source !== 'unset',
                  },
                  { field: 'source', before: 'database', after: fallback.source },
                ]
              : [
                  { field: 'value', before: removed.value, after: fallback.value ?? null },
                  { field: 'source', before: 'database', after: fallback.source },
                ],
          metadata: { kind: definition.kind, previousVersion: removed.version },
        },
        transaction,
      );
    });
    return this.toView(definition, null);
  }

  async testConnection(
    key: string,
    context: ActorContext,
    requestSignal?: AbortSignal,
  ): Promise<SettingConnectionTestResult> {
    const tester = this.registry.getConnectionTester(key);
    const values = new Map<string, unknown>();
    for (const settingKey of tester.requiredSettings) {
      const value = await this.getValue(settingKey);
      if (value === undefined) {
        throw new ApiError(409, 'SETTING_NOT_CONFIGURED', `连接测试缺少设置：${settingKey}`);
      }
      values.set(settingKey, value);
    }

    const result = await this.runConnectionTest(tester, values, requestSignal);
    const response = { ...result, testedAt: new Date().toISOString() };
    await this.audit.record({
      ...context,
      category: 'system',
      action: 'settings.connection-tested',
      resourceType: 'system.setting-test',
      resourceId: key,
      outcome: result.ok ? 'success' : 'failure',
      metadata: { requiredSettings: tester.requiredSettings },
    });
    return response;
  }

  async rotateSecrets(context: ActorContext): Promise<{ rotated: number }> {
    const currentKeyId = this.cipher.currentKeyId();
    return this.database.transaction(async (transaction) => {
      const candidates = (await this.repository.encryptedForUpdate(transaction)).filter(
        (record) => record.encryptionKeyId !== currentKeyId,
      );
      const previousKeyIds = new Set<string>();
      for (const record of candidates) {
        if (!record.encryptedValue || !record.encryptionKeyId) {
          throw new Error(`Sensitive setting storage invariant failed: ${record.key}`);
        }
        const definition = this.registry.get(record.key);
        if (definition.kind !== 'secret') {
          throw new Error(`Encrypted setting is no longer registered as secret: ${record.key}`);
        }
        const value = this.validate(
          definition,
          this.cipher.decrypt(record.encryptedValue, record.encryptionKeyId),
        );
        const encrypted = this.cipher.encrypt(value);
        const updated = await this.repository.replaceEncryption(
          record.key,
          encrypted.encryptedValue,
          encrypted.encryptionKeyId,
          record.version,
          context.actorId,
          transaction,
        );
        if (!updated) this.versionConflict();
        previousKeyIds.add(record.encryptionKeyId);
      }
      if (candidates.length > 0) {
        await this.audit.record(
          {
            ...context,
            category: 'system',
            action: 'settings.secrets.rotated',
            resourceType: 'system.settings',
            changes: [
              { field: 'encryptionKeyId', before: [...previousKeyIds], after: currentKeyId },
            ],
            metadata: { rotated: candidates.length },
          },
          transaction,
        );
      }
      return { rotated: candidates.length };
    });
  }

  private resolve<T>(
    definition: SettingDefinition<T>,
    record: StoredSetting | null,
  ): ResolvedSetting<T> {
    const environment = this.environmentValue(definition);
    if (environment.configured) {
      return {
        definition,
        value: environment.value,
        source: 'environment',
        version: null,
        updatedAt: null,
        updatedBy: null,
      };
    }
    if (record) {
      const raw =
        definition.kind === 'secret'
          ? this.cipher.decrypt(record.encryptedValue, record.encryptionKeyId ?? '')
          : record.value;
      return {
        definition,
        value: this.validate(definition, raw),
        source: 'database',
        version: record.version,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy,
      };
    }
    if (definition.defaultValue !== undefined) {
      return {
        definition,
        value: this.validate(definition, definition.defaultValue),
        source: 'default',
        version: null,
        updatedAt: null,
        updatedBy: null,
      };
    }
    return {
      definition,
      source: 'unset',
      version: null,
      updatedAt: null,
      updatedBy: null,
    };
  }

  private toView(definition: SettingDefinition, record: StoredSetting | null): SettingView {
    if (definition.kind === 'secret') {
      const resolved = this.resolveSecretView(definition, record);
      return {
        key: definition.key,
        group: definition.group,
        groupLabel: definition.groupLabel,
        label: definition.label,
        description: definition.description,
        kind: 'secret',
        control: definition.control,
        options: definition.options ?? [],
        source: resolved.source,
        configured: resolved.source !== 'unset',
        readOnly: resolved.source === 'environment',
        version: resolved.version,
        updatedAt: resolved.updatedAt?.toISOString() ?? null,
        updatedBy: resolved.updatedBy,
      };
    }

    const resolved = this.resolve(definition, record);
    const base = {
      key: definition.key,
      group: definition.group,
      groupLabel: definition.groupLabel,
      label: definition.label,
      description: definition.description,
      kind: definition.kind,
      control: definition.control,
      options: definition.options ?? [],
      source: resolved.source,
      configured: resolved.source !== 'unset',
      readOnly: resolved.source === 'environment',
      version: resolved.version,
      updatedAt: resolved.updatedAt?.toISOString() ?? null,
      updatedBy: resolved.updatedBy,
    };
    return resolved.value === undefined ? base : { ...base, value: resolved.value };
  }

  private resolveSecretView(
    definition: SettingDefinition,
    record: StoredSetting | null,
  ): Omit<ResolvedSetting, 'value'> {
    if (this.environmentValue(definition).configured) {
      return {
        definition,
        source: 'environment',
        version: null,
        updatedAt: null,
        updatedBy: null,
      };
    }
    if (record) {
      return {
        definition,
        source: 'database',
        version: record.version,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy,
      };
    }
    return {
      definition,
      source: definition.defaultValue === undefined ? 'unset' : 'default',
      version: null,
      updatedAt: null,
      updatedBy: null,
    };
  }

  private environmentValue<T>(definition: SettingDefinition<T>): {
    configured: boolean;
    value?: T;
  } {
    if (!definition.environment) return { configured: false };
    const raw = this.environment[definition.environment];
    if (raw === undefined || raw === null || raw === '') return { configured: false };
    return { configured: true, value: this.validate(definition, raw) };
  }

  private assertDatabaseMutable(definition: SettingDefinition): void {
    if (this.environmentValue(definition).configured) {
      throw new ApiError(
        409,
        'SETTING_ENVIRONMENT_OVERRIDE',
        '该设置由环境变量覆盖，不能在管理后台修改',
      );
    }
  }

  private validate<T>(definition: SettingDefinition<T>, value: unknown): T {
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'SETTING_VALUE_INVALID',
        '设置值校验失败',
        z.treeifyError(parsed.error),
      );
    }
    if (parsed.data === null || parsed.data === undefined) {
      throw new ApiError(400, 'SETTING_VALUE_INVALID', '设置值不能为 null 或 undefined');
    }
    try {
      if (JSON.stringify(parsed.data) === undefined) throw new Error('not JSON serializable');
    } catch {
      throw new ApiError(400, 'SETTING_VALUE_INVALID', '设置值必须可以安全序列化为 JSON');
    }
    return parsed.data;
  }

  private async runConnectionTest(
    tester: ReturnType<SettingsRegistry['getConnectionTester']>,
    values: ReadonlyMap<string, unknown>,
    requestSignal?: AbortSignal,
  ): Promise<Omit<SettingConnectionTestResult, 'testedAt'>> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let rejectRequestAbort: ((reason: Error) => void) | undefined;
    const abortFromRequest = () => {
      controller.abort();
      rejectRequestAbort?.(new Error('SETTING_CONNECTION_TEST_REQUEST_ABORTED'));
    };
    try {
      requestSignal?.addEventListener('abort', abortFromRequest, { once: true });
      const result = await Promise.race([
        tester.test(values, controller.signal),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('SETTING_CONNECTION_TEST_TIMEOUT'));
          }, tester.timeoutMs ?? 5_000);
        }),
        new Promise<never>((_resolve, reject) => {
          rejectRequestAbort = reject;
          if (requestSignal?.aborted) abortFromRequest();
        }),
      ]);
      return settingConnectionTestResultSchema.omit({ testedAt: true }).parse(result);
    } catch {
      controller.abort();
      return { ok: false, message: '连接测试失败或超时，请检查配置和服务可用性。' };
    } finally {
      if (timeout) clearTimeout(timeout);
      requestSignal?.removeEventListener('abort', abortFromRequest);
    }
  }

  private versionConflict(): never {
    throw new ApiError(409, 'SETTING_VERSION_CONFLICT', '设置已被其他操作修改，请刷新后重试');
  }
}
