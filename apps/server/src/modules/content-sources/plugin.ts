import type { SettingsReader } from '../settings/public.js';
import { ContentSourcesService } from './application/content-sources.service.js';
import { NotionContentSourceClient } from './infrastructure/notion-content-source.client.js';

export interface ContentSourcesModuleDependencies {
  settings: SettingsReader;
  service?: ContentSourcesService;
}

export function createContentSourcesService(dependencies: ContentSourcesModuleDependencies) {
  return (
    dependencies.service ??
    new ContentSourcesService(new NotionContentSourceClient(dependencies.settings))
  );
}

export function createNotionConnectionTester(service: ContentSourcesService) {
  return {
    key: 'content-sources.notion-connection',
    group: 'content-sources',
    label: '测试 Notion 连接',
    description: '读取当前 Connection 身份，不读取或修改任何页面内容。',
    requiredSettings: ['content-sources.notion-token', 'content-sources.notion-version'],
    timeoutMs: 10_000,
    async test(_values: ReadonlyMap<string, unknown>, signal: AbortSignal) {
      await service.notion.testConnection(signal);
      return { ok: true, message: 'Notion Connection 连接正常' };
    },
  };
}
