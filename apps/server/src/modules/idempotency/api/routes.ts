import { ApiError } from '@lingcoo-tech/http';
import { idempotencyQuerySchema } from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { IdempotencyService } from '../application/idempotency.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

export async function registerIdempotencyRoutes(
  app: FastifyInstance,
  service: IdempotencyService,
): Promise<void> {
  app.get(
    '/api/idempotency/records',
    { config: { access: { permissions: ['idempotency.read'] } } },
    async (request) => service.list(parse(idempotencyQuerySchema, request.query)),
  );

  app.get(
    '/api/idempotency/records/:id',
    { config: { access: { permissions: ['idempotency.read'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return service.get(id);
    },
  );
}
