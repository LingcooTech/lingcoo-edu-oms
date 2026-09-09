import { ApiError } from '@lingcoo-tech/http';
import { jobQuerySchema } from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { JobsService } from '../application/jobs.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function actorContext(request: Parameters<typeof auditContextFromRequest>[0]) {
  const user = request.identityPrincipal!.user;
  return {
    ...auditContextFromRequest(request, {
      type: 'user' as const,
      id: user.id,
      label: user.displayName ?? user.email ?? user.phone,
    }),
    actorId: user.id,
  };
}

export async function registerJobsRoutes(
  app: FastifyInstance,
  service: JobsService,
): Promise<void> {
  app.get('/api/jobs', { config: { access: { permissions: ['jobs.read'] } } }, async (request) =>
    service.list(parse(jobQuerySchema, request.query)),
  );

  app.get(
    '/api/jobs/:id',
    { config: { access: { permissions: ['jobs.read'] } } },
    async (request) => service.get(parse(idParamsSchema, request.params).id),
  );

  app.post(
    '/api/jobs/:id/actions/retry',
    { config: { access: { permissions: ['jobs.manage'] } } },
    async (request) =>
      service.retry(parse(idParamsSchema, request.params).id, actorContext(request)),
  );

  app.post(
    '/api/jobs/:id/actions/cancel',
    { config: { access: { permissions: ['jobs.manage'] } } },
    async (request) =>
      service.cancel(parse(idParamsSchema, request.params).id, actorContext(request)),
  );
}
