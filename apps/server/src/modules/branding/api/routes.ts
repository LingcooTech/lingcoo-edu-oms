import { createHash } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { updateBrandingRequestSchema } from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { ReadableAsset } from '../../storage/public.js';
import type { BrandingService } from '../application/branding.service.js';

export async function registerBrandingRoutes(app: FastifyInstance, service: BrandingService) {
  app.get(
    '/api/branding/public',
    { config: { access: { public: true } } },
    async (request, reply) => {
      const result = await service.getPublic();
      const etag = `"branding-${createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 24)}"`;
      reply.header(
        'cache-control',
        'public, max-age=0, must-revalidate, stale-while-revalidate=300',
      );
      reply.header('etag', etag);
      if (request.headers['if-none-match'] === etag) return reply.code(304).send();
      return result;
    },
  );
  app.get('/api/branding', { config: { access: { permissions: ['branding.read'] } } }, async () =>
    service.getAdmin(),
  );
  app.put(
    '/api/branding',
    { config: { access: { permissions: ['branding.manage'] } } },
    async (request) =>
      service.update(parse(updateBrandingRequestSchema, request.body), actor(request)),
  );
  app.get(
    '/api/branding/assets/logo',
    { config: { access: { public: true } } },
    async (_request, reply) => sendImage(reply, await service.assetContent('logo')),
  );
  app.get(
    '/api/branding/assets/favicon',
    { config: { access: { public: true } } },
    async (_request, reply) => sendImage(reply, await service.assetContent('favicon')),
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
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

function sendImage(reply: FastifyReply, content: ReadableAsset) {
  reply
    .header('content-type', content.contentType)
    .header('content-length', content.sizeBytes)
    .header('etag', `"sha256-${content.checksumSha256}"`)
    .header('x-content-type-options', 'nosniff')
    .header('content-disposition', 'inline')
    .header('cache-control', 'public, max-age=300, must-revalidate');
  return reply.send(content.body);
}
