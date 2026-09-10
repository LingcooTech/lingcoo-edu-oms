import { ApiError } from '@lingcoo-tech/http';
import {
  createContentRequestSchema,
  contentListQuerySchema,
  importNotionContentRequestSchema,
  updateContentRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { ContentService } from '../application/content.service.js';

const idParams = z.object({ contentId: z.uuid() });

export async function registerContentRoutes(app: FastifyInstance, service: ContentService) {
  app.get(
    '/api/content',
    {
      config: { access: { permissions: ['education.content.read'], allowUnscopedEducation: true } },
    },
    async (request) => service.list(parse(contentListQuerySchema, request.query)),
  );
  app.get(
    '/api/content/:contentId',
    {
      config: { access: { permissions: ['education.content.read'], allowUnscopedEducation: true } },
    },
    async (request) => service.get(parse(idParams, request.params).contentId),
  );
  app.post(
    '/api/content',
    {
      config: {
        access: { permissions: ['education.content.manage'], allowUnscopedEducation: true },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.create(parse(createContentRequestSchema, request.body), actor(request)),
        ),
  );
  app.patch(
    '/api/content/:contentId',
    {
      config: {
        access: { permissions: ['education.content.manage'], allowUnscopedEducation: true },
      },
    },
    async (request) =>
      service.update(
        parse(idParams, request.params).contentId,
        parse(updateContentRequestSchema, request.body),
        actor(request),
      ),
  );
  app.post(
    '/api/content/import/notion',
    {
      config: {
        access: { permissions: ['education.content.manage'], allowUnscopedEducation: true },
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.importNotion(
            parse(importNotionContentRequestSchema, request.body),
            actor(request),
          ),
        ),
  );
  app.get(
    '/api/public/content/:slug',
    { config: { access: { public: true } } },
    async (request) => {
      const slug = z.object({ slug: z.string().trim().min(1).max(160) }).parse(request.params).slug;
      const item = await service.getBySlug(slug);
      if (item.status !== 'published') throw new ApiError(404, 'CONTENT_NOT_FOUND', '内容不存在');
      return item;
    },
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  return result.data;
}

function actor(request: FastifyRequest) {
  const user = request.identityPrincipal!.user;
  return auditContextFromRequest(request, {
    type: 'user',
    id: user.id,
    label: user.displayName ?? user.email ?? user.phone,
  });
}
