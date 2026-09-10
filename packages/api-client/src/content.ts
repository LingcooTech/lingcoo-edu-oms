import {
  contentItemSchema,
  contentListQuerySchema,
  contentPageSchema,
  createContentRequestSchema,
  importNotionContentRequestSchema,
  updateContentRequestSchema,
  type ContentListQuery,
  type CreateContentRequest,
  type ImportNotionContentRequest,
  type UpdateContentRequest,
} from '@lingcoo-edu-oms/contracts';

import { idSchema } from '@lingcoo-edu-oms/contracts';
import type { ApiClient } from './client.js';

function queryString(input: ContentListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

export function createContentApi(client: ApiClient) {
  return {
    list(input: Partial<ContentListQuery> = {}) {
      const query = contentListQuerySchema.parse(input);
      return client.request({
        path: `/api/content${queryString(query)}`,
        schema: contentPageSchema,
      });
    },
    get(id: string) {
      return client.request({ path: `/api/content/${pathId(id)}`, schema: contentItemSchema });
    },
    create(input: CreateContentRequest) {
      return client.request({
        method: 'POST',
        path: '/api/content',
        body: createContentRequestSchema.parse(input),
        schema: contentItemSchema,
      });
    },
    update(id: string, input: UpdateContentRequest) {
      return client.request({
        method: 'PATCH',
        path: `/api/content/${pathId(id)}`,
        body: updateContentRequestSchema.parse(input),
        schema: contentItemSchema,
      });
    },
    importNotion(input: ImportNotionContentRequest) {
      return client.request({
        method: 'POST',
        path: '/api/content/import/notion',
        body: importNotionContentRequestSchema.parse(input),
        schema: contentItemSchema,
      });
    },
  };
}

export type ContentApi = ReturnType<typeof createContentApi>;
