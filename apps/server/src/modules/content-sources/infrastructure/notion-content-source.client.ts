import { ApiError } from '@lingcoo-tech/http';
import { z } from 'zod';

import type { SettingsReader } from '../../settings/public.js';
import type {
  ContentSourceBlockPage,
  ContentSourcePage,
  NotionContentSourceGateway,
} from '../domain/model.js';
import { notionObjectId } from '../domain/model.js';

const pageSchema = z.object({ id: z.string().min(1) }).passthrough();
const blockPageSchema = z
  .object({
    results: z.array(z.record(z.string(), z.unknown())),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .passthrough();

export class NotionContentSourceClient implements NotionContentSourceGateway {
  constructor(
    private readonly settings: SettingsReader,
    private readonly request: typeof fetch = fetch,
  ) {}

  async retrievePage(pageIdOrUrl: string, signal?: AbortSignal): Promise<ContentSourcePage> {
    await this.assertEnabled();
    const page = pageSchema.parse(
      await this.call(`/v1/pages/${encodeURIComponent(notionObjectId(pageIdOrUrl))}`, signal),
    );
    return { id: page.id, raw: page };
  }

  async listBlockChildren(
    blockId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ContentSourceBlockPage> {
    await this.assertEnabled();
    const query = new URLSearchParams({ page_size: '100' });
    if (cursor) query.set('start_cursor', cursor);
    const page = blockPageSchema.parse(
      await this.call(
        `/v1/blocks/${encodeURIComponent(notionObjectId(blockId))}/children?${query}`,
        signal,
      ),
    );
    return { items: page.results, nextCursor: page.next_cursor, hasMore: page.has_more };
  }

  async testConnection(signal: AbortSignal): Promise<void> {
    await this.call('/v1/users/me', signal);
  }

  private async call(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const [token, version] = await Promise.all([
      this.settings.getValue<string>('content-sources.notion-token'),
      this.settings.getValue<string>('content-sources.notion-version'),
    ]);
    if (!token) {
      throw new ApiError(503, 'NOTION_NOT_CONFIGURED', 'Notion Token 尚未配置');
    }
    const response = await this.request(new URL(path, 'https://api.notion.com'), {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'notion-version': version ?? '2026-03-11',
      },
      signal,
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new ApiError(502, 'NOTION_UPSTREAM_ERROR', 'Notion 接口请求失败', {
        status: response.status,
        code: typeof payload.code === 'string' ? payload.code : undefined,
      });
    }
    return payload;
  }

  private async assertEnabled() {
    if (!(await this.settings.getValue<boolean>('content-sources.notion.enabled'))) {
      throw new ApiError(503, 'NOTION_CONTENT_SOURCE_DISABLED', 'Notion 内容源尚未启用');
    }
  }
}
