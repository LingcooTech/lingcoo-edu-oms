import { describe, expect, it, vi } from 'vitest';

import { createSettingsApi } from '../src/settings.js';

describe('settings api', () => {
  it('sends explicit optimistic versions when saving and clearing', async () => {
    const requests: Array<Record<string, unknown>> = [];
    const client = {
      async request(request: Record<string, unknown>) {
        requests.push(request);
        return {};
      },
    };
    const api = createSettingsApi(client as never);

    await api.save('application.locale', { value: 'zh-CN', expectedVersion: null });
    await api.clear('application.locale', { expectedVersion: 2 });

    expect(requests).toMatchObject([
      {
        method: 'PUT',
        path: '/api/settings/application.locale',
        body: { value: 'zh-CN', expectedVersion: null },
      },
      {
        method: 'DELETE',
        path: '/api/settings/application.locale',
        body: { expectedVersion: 2 },
      },
    ]);
  });

  it('rejects malformed setting keys before making a request', () => {
    const api = createSettingsApi({ request: vi.fn() } as never);
    expect(() => api.testConnection('../secret')).toThrow();
  });
});
