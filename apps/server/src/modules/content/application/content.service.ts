import { ApiError } from '@lingcoo-tech/http';
import type {
  ContentItem,
  ContentListQuery,
  CreateContentRequest,
  ImportNotionContentRequest,
  UpdateContentRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import { notionObjectId, type NotionContentSourceGateway } from '../../content-sources/public.js';
import {
  ContentRepository,
  type ContentRecord,
} from '../infrastructure/persistence/content.repository.js';

const stringValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 140) || `content-${Date.now().toString(36)}`;

function richText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) =>
      item && typeof item === 'object' && 'plain_text' in item ? stringValue(item.plain_text) : '',
    )
    .join('');
}

function pageTitle(raw: Record<string, unknown>): string {
  const properties =
    raw.properties && typeof raw.properties === 'object'
      ? (raw.properties as Record<string, unknown>)
      : {};
  for (const property of Object.values(properties)) {
    if (!property || typeof property !== 'object') continue;
    const item = property as Record<string, unknown>;
    if (item.type === 'title') return richText(item.title) || '未命名内容';
  }
  return '未命名内容';
}

function pageCover(raw: Record<string, unknown>): string | null {
  const cover =
    raw.cover && typeof raw.cover === 'object' ? (raw.cover as Record<string, unknown>) : null;
  const external =
    cover?.external && typeof cover.external === 'object'
      ? (cover.external as Record<string, unknown>)
      : null;
  const file =
    cover?.file && typeof cover.file === 'object' ? (cover.file as Record<string, unknown>) : null;
  return stringValue(external?.url) || stringValue(file?.url) || null;
}

function renderBlock(block: Record<string, unknown>): string {
  const type = stringValue(block.type);
  const payload = block[type];
  if (!payload || typeof payload !== 'object') return '';
  const data = payload as Record<string, unknown>;
  const content = escapeHtml(richText(data.rich_text ?? data.text ?? data.caption));
  if (type === 'paragraph') return content ? `<p>${content}</p>` : '';
  if (type === 'heading_1') return `<h1>${content}</h1>`;
  if (type === 'heading_2') return `<h2>${content}</h2>`;
  if (type === 'heading_3') return `<h3>${content}</h3>`;
  if (type === 'bulleted_list_item') return content ? `<li>${content}</li>` : '';
  if (type === 'numbered_list_item') return content ? `<li>${content}</li>` : '';
  if (type === 'quote') return content ? `<blockquote>${content}</blockquote>` : '';
  if (type === 'callout') return content ? `<aside>${content}</aside>` : '';
  if (type === 'code') return content ? `<pre><code>${content}</code></pre>` : '';
  if (type === 'divider') return '<hr />';
  if (type === 'image') {
    const image =
      data.external && typeof data.external === 'object'
        ? (data.external as Record<string, unknown>)
        : data.file && typeof data.file === 'object'
          ? (data.file as Record<string, unknown>)
          : {};
    const url = stringValue(image.url);
    return url ? `<figure><img src="${escapeHtml(url)}" alt="${content}" /></figure>` : '';
  }
  const url = stringValue(data.url);
  return type === 'bookmark' && url
    ? `<p><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a></p>`
    : content
      ? `<p>${content}</p>`
      : '';
}

function renderBlocks(blocks: Record<string, unknown>[]): string {
  const output: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  const flush = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };
  for (const block of blocks) {
    const type = stringValue(block.type);
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const next = type === 'bulleted_list_item' ? 'ul' : 'ol';
      if (listType !== next) {
        flush();
        output.push(`<${next}>`);
        listType = next;
      }
      output.push(renderBlock(block));
    } else {
      flush();
      output.push(renderBlock(block));
    }
  }
  flush();
  return output.join('');
}

export class ContentService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: ContentRepository,
    private readonly notion: NotionContentSourceGateway,
    private readonly audit: AuditWriter,
  ) {}

  async list(input: ContentListQuery) {
    const result = await this.repository.list(input);
    return {
      items: result.items.map((record) => this.view(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async get(id: string): Promise<ContentItem> {
    const record = await this.repository.find(id);
    if (!record) throw new ApiError(404, 'CONTENT_NOT_FOUND', '内容不存在');
    return this.view(record);
  }

  async getBySlug(slug: string): Promise<ContentItem> {
    const record = await this.repository.findBySlug(slug);
    if (!record) throw new ApiError(404, 'CONTENT_NOT_FOUND', '内容不存在');
    return this.view(record);
  }

  async create(input: CreateContentRequest, context: AuditContext): Promise<ContentItem> {
    return this.database.transaction(async (transaction) => {
      const record = await this.repository.create(
        { ...input, slug: await this.uniqueSlug(input.slug || input.title), sourceType: 'manual' },
        transaction,
      );
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'content.created',
          resourceType: 'content.item',
          resourceId: record.id,
          changes: [{ field: 'title', before: null, after: record.title }],
        },
        transaction,
      );
      return this.view(record);
    });
  }

  async update(
    id: string,
    input: UpdateContentRequest,
    context: AuditContext,
  ): Promise<ContentItem> {
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.find(id, transaction);
      if (!before) throw new ApiError(404, 'CONTENT_NOT_FOUND', '内容不存在');
      const { expectedRevision, ...fields } = input;
      const changes = {
        ...fields,
        ...(fields.slug !== undefined
          ? { slug: await this.uniqueSlug(fields.slug || fields.title || before.title, id) }
          : {}),
        ...(fields.status === 'published' && !before.publishedAt
          ? { publishedAt: new Date() }
          : {}),
        ...(fields.status && fields.status !== 'published' ? { publishedAt: null } : {}),
      };
      const record = await this.repository.update(
        id,
        { ...changes, expectedRevision } as never,
        transaction,
      );
      if (!record) throw new ApiError(409, 'CONTENT_VERSION_CONFLICT', '内容已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'content.updated',
          resourceType: 'content.item',
          resourceId: id,
          changes: Object.entries(fields).map(([field, after]) => ({
            field,
            before: before[field as keyof ContentRecord] ?? null,
            after: after ?? null,
          })),
        },
        transaction,
      );
      return this.view(record);
    });
  }

  async importNotion(
    input: ImportNotionContentRequest,
    context: AuditContext,
  ): Promise<ContentItem> {
    const pageId = notionObjectId(input.pageIdOrUrl);
    const page = await this.notion.retrievePage(pageId);
    const blocks: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.notion.listBlockChildren(page.id, cursor);
      blocks.push(...result.items);
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    const title = pageTitle(page.raw);
    const contentHtml = renderBlocks(blocks);
    const existing = await this.repository.findBySource('notion', page.id);
    return this.database.transaction(async (transaction) => {
      const payload = {
        title,
        slug: await this.uniqueSlug(existing?.slug ?? title, existing?.id),
        excerpt: contentHtml.replaceAll(/<[^>]+>/g, '').slice(0, 240),
        contentHtml,
        coverUrl: pageCover(page.raw),
        coverThumbUrl: null,
        authorName:
          stringValue((page.raw.created_by as Record<string, unknown> | undefined)?.name) || null,
        status: existing?.status ?? input.status,
        isPinned: existing?.isPinned ?? false,
        sourceType: 'notion' as const,
        sourceId: page.id,
        sourceUrl: stringValue(page.raw.url) || null,
        importedAt: new Date(),
        meta: { notion: { pageId: page.id, importedBlockCount: blocks.length } },
      };
      const record = existing
        ? await this.repository.update(
            existing.id,
            { ...payload, expectedRevision: existing.revision } as never,
            transaction,
          )
        : await this.repository.create(payload, transaction);
      if (!record)
        throw new ApiError(409, 'CONTENT_IMPORT_CONFLICT', 'Notion 内容已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: existing ? 'content.notion-reimported' : 'content.notion-imported',
          resourceType: 'content.item',
          resourceId: record.id,
          changes: [{ field: 'sourceId', before: existing?.sourceId ?? null, after: page.id }],
        },
        transaction,
      );
      return this.view(record);
    });
  }

  private async uniqueSlug(value: string, excludeId?: string) {
    const base = slugify(value);
    let candidate = base;
    for (let suffix = 2; ; suffix += 1) {
      const existing = await this.repository.findBySlug(candidate);
      if (!existing || existing.id === excludeId) return candidate;
      candidate = `${base}-${suffix}`.slice(0, 160);
    }
  }

  private view(record: ContentRecord): ContentItem {
    return {
      ...record,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      importedAt: record.importedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
