import {
  assetDetailSchema,
  assetPageSchema,
  assetQuerySchema,
  authorizeAssetReplacementRequestSchema,
  authorizeAssetUploadRequestSchema,
  deleteAssetRequestSchema,
  storageUploadAuthorizationSchema,
  updateAssetRequestSchema,
  type AssetQuery,
  type AuthorizeAssetUploadRequest,
  type UpdateAssetRequest,
} from '@lingcoo-edu-oms/contracts';
import { z } from 'zod';

import type { ApiClient } from './client.js';

function queryString(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createStorageApi(client: ApiClient) {
  const complete = (objectId: string) =>
    client.request({
      path: `/api/storage/uploads/${encodeURIComponent(objectId)}/actions/complete`,
      method: 'POST',
      schema: assetDetailSchema,
    });

  async function sendFile(
    authorization: z.infer<typeof storageUploadAuthorizationSchema>,
    file: File,
  ) {
    if (authorization.completed) return complete(authorization.objectId);
    if (!authorization.upload) throw new Error('Upload target is missing');
    if (authorization.upload.method === 'POST') {
      const form = new FormData();
      form.set('file', file, file.name);
      return client.request({
        path: authorization.upload.url,
        method: 'POST',
        headers: authorization.upload.headers,
        body: form,
        schema: assetDetailSchema,
      });
    }
    await client.uploadRaw({
      url: authorization.upload.url,
      headers: authorization.upload.headers,
      body: file,
    });
    return complete(authorization.objectId);
  }

  return {
    list(input: Partial<AssetQuery> = {}) {
      const query = assetQuerySchema.parse(input);
      return client.request({
        path: `/api/storage/assets?${queryString(query)}`,
        schema: assetPageSchema,
      });
    },
    get(id: string) {
      return client.request({
        path: `/api/storage/assets/${encodeURIComponent(id)}`,
        schema: assetDetailSchema,
      });
    },
    async upload(file: File, input: Partial<AuthorizeAssetUploadRequest> = {}) {
      const request = authorizeAssetUploadRequestSchema.parse({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        ...input,
      });
      const authorization = await client.request({
        path: '/api/storage/assets/upload-authorizations',
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: request,
        schema: storageUploadAuthorizationSchema,
      });
      return sendFile(authorization, file);
    },
    async replace(id: string, revision: number, file: File) {
      const request = authorizeAssetReplacementRequestSchema.parse({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        expectedRevision: revision,
      });
      const authorization = await client.request({
        path: `/api/storage/assets/${encodeURIComponent(id)}/replacement-authorizations`,
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: request,
        schema: storageUploadAuthorizationSchema,
      });
      return sendFile(authorization, file);
    },
    update(id: string, input: UpdateAssetRequest) {
      return client.request({
        path: `/api/storage/assets/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: updateAssetRequestSchema.parse(input),
        schema: assetDetailSchema,
      });
    },
    delete(id: string, expectedRevision: number) {
      return client.request({
        path: `/api/storage/assets/${encodeURIComponent(id)}`,
        method: 'DELETE',
        body: deleteAssetRequestSchema.parse({ expectedRevision }),
        schema: z.object({ id: z.uuid() }),
      });
    },
  };
}

export type StorageApi = ReturnType<typeof createStorageApi>;
