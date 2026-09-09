import { describe, expect, it, vi } from 'vitest';

import type { SettingsReader } from '../src/modules/settings/public.js';
import { notionObjectId } from '../src/modules/content-sources/domain/model.js';
import { NotionContentSourceClient } from '../src/modules/content-sources/infrastructure/notion-content-source.client.js';

function settings(values: Record<string, unknown>): SettingsReader {
  return {
    async getValue<T>(key: string) {
      return values[key] as T | undefined;
    },
    async publicValues() {
      return {};
    },
  };
}

describe('Notion content source client', () => {
  it('normalizes page IDs from Notion URLs', () => {
    expect(notionObjectId('https://www.notion.so/Title-0123456789abcdef0123456789abcdef')).toBe(
      '01234567-89ab-cdef-0123-456789abcdef',
    );
  });

  it('retrieves a page using the configured API version without exposing the token in the URL', async () => {
    const request = vi.fn<typeof fetch>();
    request.mockResolvedValue(
      Response.json({ object: 'page', id: '01234567-89ab-cdef-0123-456789abcdef' }),
    );
    const client = new NotionContentSourceClient(
      settings({
        'content-sources.notion.enabled': true,
        'content-sources.notion-token': 'ntn_test_token_value',
        'content-sources.notion-version': '2026-03-11',
      }),
      request as typeof fetch,
    );

    await expect(client.retrievePage('0123456789abcdef0123456789abcdef')).resolves.toMatchObject({
      id: '01234567-89ab-cdef-0123-456789abcdef',
    });
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).not.toContain('ntn_test_token_value');
    expect(new Headers(init?.headers).get('notion-version')).toBe('2026-03-11');
  });
});
