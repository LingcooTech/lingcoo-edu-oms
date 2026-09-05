import { readinessResponseSchema } from '@lingcoo-edu-oms/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/index.js';

describe('api client', () => {
  it('validates successful responses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', info: { database: { status: 'up' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createApiClient({ fetch });

    await expect(
      client.request({ path: '/health/ready', schema: readinessResponseSchema }),
    ).resolves.toMatchObject({ status: 'ok' });
  });

  it('throws a typed API error', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'r1' } }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      );
    const client = createApiClient({ fetch });

    await expect(
      client.request({ path: '/private', schema: readinessResponseSchema }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403, requestId: 'r1' });
  });

  it('sends FormData without forcing a JSON content type', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', info: { database: { status: 'up' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createApiClient({ fetch, getCsrfToken: () => 'csrf-token' });
    const form = new FormData();
    form.set('file', new Blob(['hello']), 'hello.txt');
    await client.request({
      path: '/upload',
      method: 'POST',
      body: form,
      schema: readinessResponseSchema,
    });
    const init = fetch.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.has('content-type')).toBe(false);
    expect(headers.get('x-csrf-token')).toBe('csrf-token');
    expect(init?.body).toBe(form);
  });

  it('uploads directly to object storage without credentials or CSRF', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const client = createApiClient({ fetch, getCsrfToken: () => 'csrf-token' });
    await client.uploadRaw({
      url: 'https://storage.example/upload',
      headers: { 'content-type': 'image/png' },
      body: new Blob(['png'], { type: 'image/png' }),
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/upload',
      expect.objectContaining({ method: 'PUT', credentials: 'omit' }),
    );
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('x-csrf-token')).toBe(false);
  });
});
