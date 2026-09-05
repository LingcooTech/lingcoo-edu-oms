import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { SettingsRegistry } from '../src/modules/settings/application/settings.registry.js';
import type { SettingDefinition } from '../src/modules/settings/public.js';

function definition(overrides: Partial<SettingDefinition> = {}): SettingDefinition {
  return {
    key: 'test.example-value',
    group: 'test',
    groupLabel: '测试',
    label: '示例',
    description: '设置注册表测试。',
    kind: 'internal',
    schema: z.string().min(1),
    control: 'text',
    ...overrides,
  };
}

describe('settings registry', () => {
  it('rejects duplicate keys and secret defaults', () => {
    const registry = new SettingsRegistry([]);
    registry.register(definition());
    expect(() => registry.register(definition())).toThrow(/already registered/);
    expect(
      () =>
        new SettingsRegistry([
          definition({
            key: 'test.secret-value',
            kind: 'secret',
            defaultValue: 'must-not-live-in-code',
          }),
        ]),
    ).toThrow(/cannot have a code default/);
  });

  it('validates every select option against the setting schema', () => {
    expect(
      () =>
        new SettingsRegistry([
          definition({
            schema: z.enum(['supported']),
            control: 'select',
            options: [{ label: '无效', value: 'unsupported' }],
          }),
        ]),
    ).toThrow();
  });

  it('requires connection test dependencies to be registered', () => {
    const registry = new SettingsRegistry([]);
    expect(() =>
      registry.registerConnectionTester({
        key: 'test.connection',
        group: 'test',
        label: '连接测试',
        description: '验证依赖设置。',
        requiredSettings: ['test.missing-value'],
        async test() {
          return { ok: true, message: 'ok' };
        },
      }),
    ).toThrow('设置项未注册');
  });
});
