import { describe, expect, it } from 'vitest';

import {
  saveSettingRequestSchema,
  settingViewSchema,
  settingsListResponseSchema,
} from '../src/settings.js';

describe('settings contracts', () => {
  it('requires an explicit optimistic concurrency version', () => {
    expect(saveSettingRequestSchema.parse({ value: 'value', expectedVersion: null })).toEqual({
      value: 'value',
      expectedVersion: null,
    });
    expect(() => saveSettingRequestSchema.parse({ value: 'value' })).toThrow();
  });

  it('never accepts a secret plaintext in an API view', () => {
    const base = {
      key: 'integrations.api-secret',
      group: 'integrations',
      groupLabel: '集成',
      label: 'API Secret',
      description: 'Secret for tests.',
      control: 'text',
      options: [],
      source: 'database',
      configured: true,
      readOnly: false,
      version: 1,
      updatedAt: '2026-08-31T00:00:00.000Z',
      updatedBy: null,
    } as const;
    expect(() =>
      settingViewSchema.parse({ ...base, kind: 'secret', value: 'plaintext' }),
    ).toThrow();
    expect(settingViewSchema.parse({ ...base, kind: 'secret' })).not.toHaveProperty('value');
  });

  it('validates a complete registry response', () => {
    expect(settingsListResponseSchema.parse({ items: [], connectionTests: [] })).toEqual({
      items: [],
      connectionTests: [],
    });
  });
});
