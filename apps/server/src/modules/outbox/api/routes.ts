import { ApiError } from '@lingcoo-tech/http';
import { outboxQuerySchema } from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { OutboxAdminService } from '../application/outbox-admin.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  return result.data;
}

export async function registerOutboxRoutes(app: FastifyInstance, service: OutboxAdminService) {
  app.get(
    '/api/outbox/events',
    { config: { access: { permissions: ['outbox.read'] } } },
    async (request) => service.list(parse(outboxQuerySchema, request.query)),
  );
  app.get(
    '/api/outbox/events/:id',
    { config: { access: { permissions: ['outbox.read'] } } },
    async (request) => service.get(parse(idParamsSchema, request.params).id),
  );
  app.post(
    '/api/outbox/events/:id/actions/replay',
    { config: { access: { permissions: ['outbox.manage'] } } },
    async (request) => {
      const user = request.identityPrincipal!.user;
      return service.replay(parse(idParamsSchema, request.params).id, {
        ...auditContextFromRequest(request, {
          type: 'user',
          id: user.id,
          label: user.displayName ?? user.email,
        }),
        actorId: user.id,
      });
    },
  );
}
