import { ApiError } from '@lingcoo-tech/http';
import { auditQuerySchema } from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AuditService } from '../application/audit.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function serializeEvent(event: Awaited<ReturnType<AuditService['get']>>) {
  return { ...event, occurredAt: event.occurredAt.toISOString() };
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  service: AuditService,
): Promise<void> {
  app.get(
    '/api/audit/events',
    { config: { access: { permissions: ['audit.read'] } } },
    async (request) => {
      const page = await service.list(parse(auditQuerySchema, request.query));
      return { ...page, items: page.items.map(serializeEvent) };
    },
  );

  app.get(
    '/api/audit/events/:id',
    { config: { access: { permissions: ['audit.read'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return serializeEvent(await service.get(id));
    },
  );
}
