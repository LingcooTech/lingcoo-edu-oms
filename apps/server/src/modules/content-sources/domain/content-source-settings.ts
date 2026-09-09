import { z } from 'zod';

import type { SettingDefinition } from '../../settings/public.js';

export const CONTENT_SOURCE_SETTINGS: SettingDefinition[] = [
  {
    key: 'content-sources.notion.enabled',
    group: 'content-sources',
    groupLabel: '内容来源',
    groupOrder: 80,
    label: '启用 Notion 内容源',
    description: '启用后可由后续内容模块调用 Notion Provider 导入页面。',
    kind: 'internal',
    schema: z.boolean(),
    environment: 'NOTION_CONTENT_SOURCE_ENABLED',
    defaultValue: false,
    control: 'boolean',
  },
  {
    key: 'content-sources.notion-token',
    group: 'content-sources',
    groupLabel: '内容来源',
    groupOrder: 80,
    label: 'Notion Token',
    description: 'Notion Connection Token，仅服务端使用、加密保存且永不回显。',
    kind: 'secret',
    schema: z.string().trim().min(10).max(1_000),
    environment: 'NOTION_API_TOKEN',
    control: 'text',
  },
  {
    key: 'content-sources.notion-version',
    group: 'content-sources',
    groupLabel: '内容来源',
    groupOrder: 80,
    label: 'Notion API 版本',
    description: '固定 API 行为，升级前需要执行兼容性测试。',
    kind: 'internal',
    schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    environment: 'NOTION_API_VERSION',
    defaultValue: '2026-03-11',
    control: 'text',
  },
];
