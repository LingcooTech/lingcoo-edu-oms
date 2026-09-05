import { ApiError } from '@lingcoo-tech/http';
import {
  assetQuerySchema,
  authorizeAssetReplacementRequestSchema,
  authorizeAssetUploadRequestSchema,
  deleteAssetRequestSchema,
  updateAssetRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { AssetLibraryService } from '../application/asset-library.service.js';
import type { AssetUploadService } from '../application/asset-upload.service.js';
import type { ReadableAsset } from '../domain/model.js';

const idParamsSchema = z.object({ id: z.uuid() });
const idempotencyKeySchema = z.string().trim().min(8).max(200);

export async function registerStorageRoutes(
  app: FastifyInstance,
  dependencies: {
    library: AssetLibraryService;
    uploads: AssetUploadService;
    maxUploadBytes: number;
  },
) {
  app.get(
    '/api/storage/assets',
    { config: { access: { permissions: ['storage.read'] } } },
    async (request) => dependencies.library.list(parse(assetQuerySchema, request.query)),
  );
  app.get(
    '/api/storage/assets/:id',
    { config: { access: { permissions: ['storage.read'] } } },
    async (request) => dependencies.library.get(parse(idParamsSchema, request.params).id),
  );
  app.get(
    '/api/storage/assets/:id/content',
    { config: { access: { permissions: ['storage.read'] } } },
    async (request, reply) =>
      sendContent(
        reply,
        await dependencies.library.content(parse(idParamsSchema, request.params).id, false),
        false,
      ),
  );
  app.get(
    '/api/assets/public/:id/content',
    { config: { access: { public: true } } },
    async (request, reply) =>
      sendContent(
        reply,
        await dependencies.library.content(parse(idParamsSchema, request.params).id, true),
        true,
      ),
  );
  app.post(
    '/api/storage/assets/upload-authorizations',
    { config: { access: { permissions: ['storage.manage'] } } },
    async (request) =>
      dependencies.uploads.authorizeNew(
        parse(authorizeAssetUploadRequestSchema, request.body),
        idempotencyKey(request.headers['idempotency-key']),
        actor(request),
      ),
  );
  app.post(
    '/api/storage/assets/:id/replacement-authorizations',
    { config: { access: { permissions: ['storage.manage'] } } },
    async (request) =>
      dependencies.uploads.authorizeReplacement(
        parse(idParamsSchema, request.params).id,
        parse(authorizeAssetReplacementRequestSchema, request.body),
        idempotencyKey(request.headers['idempotency-key']),
        actor(request),
      ),
  );
  app.post(
    '/api/storage/uploads/:id/content',
    {
      config: { access: { permissions: ['storage.manage'] } },
      bodyLimit: dependencies.maxUploadBytes + 64 * 1_024,
    },
    async (request) => {
      let part;
      try {
        part = await request.file();
      } catch (error) {
        multipartError(error);
      }
      if (!part || part.fieldname !== 'file') {
        throw new ApiError(400, 'STORAGE_FILE_REQUIRED', '必须提交 file 文件字段');
      }
      let content: Buffer;
      try {
        content = await part.toBuffer();
      } catch (error) {
        multipartError(error);
      }
      return dependencies.uploads.uploadLocal(
        parse(idParamsSchema, request.params).id,
        content,
        actor(request),
      );
    },
  );
  app.post(
    '/api/storage/uploads/:id/actions/complete',
    { config: { access: { permissions: ['storage.manage'] } } },
    async (request) =>
      dependencies.uploads.complete(parse(idParamsSchema, request.params).id, actor(request)),
  );
  app.put(
    '/api/storage/assets/:id',
    { config: { access: { permissions: ['storage.manage'] } } },
    async (request) =>
      dependencies.library.update(
        parse(idParamsSchema, request.params).id,
        parse(updateAssetRequestSchema, request.body),
        actor(request),
      ),
  );
  app.delete(
    '/api/storage/assets/:id',
    { config: { access: { permissions: ['storage.manage'] } } },
    async (request) =>
      dependencies.library.delete(
        parse(idParamsSchema, request.params).id,
        parse(deleteAssetRequestSchema, request.body),
        actor(request),
      ),
  );
}

function multipartError(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === 'FST_REQ_FILE_TOO_LARGE') {
    throw new ApiError(413, 'STORAGE_FILE_TOO_LARGE', '文件超过系统允许的大小');
  }
  throw new ApiError(400, 'STORAGE_MULTIPART_INVALID', '上传表单格式无效');
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function idempotencyKey(value: string | string[] | undefined): string {
  const result = idempotencyKeySchema.safeParse(Array.isArray(value) ? value[0] : value);
  if (!result.success) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', '必须提供有效的 Idempotency-Key');
  }
  return result.data;
}

function actor(request: Parameters<typeof auditContextFromRequest>[0]) {
  const user = request.identityPrincipal!.user;
  return {
    ...auditContextFromRequest(request, {
      type: 'user' as const,
      id: user.id,
      label: user.displayName ?? user.email,
    }),
    actorId: user.id,
  };
}

function sendContent(reply: FastifyReply, content: ReadableAsset, publicContent: boolean) {
  const fallback = content.originalName.replaceAll(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'file';
  reply
    .header('content-type', content.contentType)
    .header('content-length', content.sizeBytes)
    .header('etag', `"sha256-${content.checksumSha256}"`)
    .header('x-content-type-options', 'nosniff')
    .header(
      'content-disposition',
      `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(content.originalName)}`,
    )
    .header('cache-control', publicContent ? 'public, max-age=300, must-revalidate' : 'no-store');
  return reply.send(content.body);
}
