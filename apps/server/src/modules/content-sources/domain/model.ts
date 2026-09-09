export interface ContentSourcePage {
  id: string;
  raw: Record<string, unknown>;
}

export interface ContentSourceBlockPage {
  items: Record<string, unknown>[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface NotionContentSourceGateway {
  retrievePage(pageIdOrUrl: string, signal?: AbortSignal): Promise<ContentSourcePage>;
  listBlockChildren(
    blockId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ContentSourceBlockPage>;
  testConnection(signal: AbortSignal): Promise<void>;
}

export function notionObjectId(value: string): string {
  const match = value
    .trim()
    .match(/[0-9a-fA-F]{32}|[0-9a-fA-F-]{36}/g)
    ?.at(-1);
  if (!match) throw new Error('无效的 Notion 页面 ID 或 URL');
  const compact = match.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new Error('无效的 Notion 页面 ID 或 URL');
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}
