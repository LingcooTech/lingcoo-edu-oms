import { apiErrorResponseSchema } from '@lingcoo-edu-oms/contracts';
import type { z } from 'zod';

import { ApiClientError } from './errors.js';

type Fetch = typeof globalThis.fetch;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: Fetch;
  getCsrfToken?: () => string | undefined;
}

export interface ApiRequest<TSchema extends z.ZodType> {
  path: string;
  schema: TSchema;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface RawUploadRequest {
  url: string;
  body: Blob;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Expected JSON response but received ${response.headers.get('content-type')}`);
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? '';

  return {
    async request<TSchema extends z.ZodType>(
      request: ApiRequest<TSchema>,
    ): Promise<z.output<TSchema>> {
      const method = request.method ?? 'GET';
      const headers = new Headers(request.headers);
      headers.set('accept', 'application/json');
      const formData =
        typeof FormData !== 'undefined' && request.body instanceof FormData
          ? request.body
          : undefined;
      if (request.body !== undefined && !formData) headers.set('content-type', 'application/json');

      const csrfToken = options.getCsrfToken?.();
      if (csrfToken && !['GET'].includes(method)) headers.set('x-csrf-token', csrfToken);

      const response = await fetchImplementation(joinUrl(baseUrl, request.path), {
        method,
        headers,
        credentials: 'include',
        body:
          request.body === undefined
            ? undefined
            : formData
              ? formData
              : JSON.stringify(request.body),
        signal: request.signal,
      });
      const payload = await readJson(response);

      if (!response.ok) {
        const parsed = apiErrorResponseSchema.safeParse(payload);
        if (parsed.success) throw new ApiClientError(response.status, parsed.data);
        throw new Error(`API request failed with status ${response.status}`);
      }

      return request.schema.parse(payload);
    },
    async uploadRaw(request: RawUploadRequest): Promise<void> {
      const response = await fetchImplementation(request.url, {
        method: 'PUT',
        headers: request.headers,
        credentials: 'omit',
        body: request.body,
        signal: request.signal,
      });
      if (!response.ok)
        throw new Error(`Object storage upload failed with status ${response.status}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
