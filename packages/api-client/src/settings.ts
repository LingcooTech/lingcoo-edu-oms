import {
  clearSettingRequestSchema,
  publicSettingsResponseSchema,
  rotateSettingSecretsResponseSchema,
  saveSettingRequestSchema,
  settingConnectionTestResultSchema,
  settingKeySchema,
  settingsListResponseSchema,
  settingViewSchema,
  type ClearSettingRequest,
  type SaveSettingRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function keyPath(key: string): string {
  return encodeURIComponent(settingKeySchema.parse(key));
}

export function createSettingsApi(client: ApiClient) {
  return {
    list() {
      return client.request({ path: '/api/settings', schema: settingsListResponseSchema });
    },
    publicValues() {
      return client.request({ path: '/api/settings/public', schema: publicSettingsResponseSchema });
    },
    save(key: string, input: SaveSettingRequest) {
      return client.request({
        method: 'PUT',
        path: `/api/settings/${keyPath(key)}`,
        body: saveSettingRequestSchema.parse(input),
        schema: settingViewSchema,
      });
    },
    clear(key: string, input: ClearSettingRequest) {
      return client.request({
        method: 'DELETE',
        path: `/api/settings/${keyPath(key)}`,
        body: clearSettingRequestSchema.parse(input),
        schema: settingViewSchema,
      });
    },
    testConnection(key: string) {
      return client.request({
        method: 'POST',
        path: `/api/settings/tests/${keyPath(key)}`,
        schema: settingConnectionTestResultSchema,
      });
    },
    rotateSecrets() {
      return client.request({
        method: 'POST',
        path: '/api/settings/actions/rotate-secrets',
        schema: rotateSettingSecretsResponseSchema,
      });
    },
  };
}

export type SettingsApi = ReturnType<typeof createSettingsApi>;
