import { ApiError } from '@lingcoo-tech/http';
import {
  createLessonPackageRequestSchema,
  lessonPackageListQuerySchema,
  updateLessonPackageRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { LessonProductsService } from '../application/lesson-products.service.js';

const institutionParams = z.object({ institutionId: z.uuid() });
const packageParams = institutionParams.extend({ packageId: z.uuid() });

export async function registerLessonProductsRoutes(
  app: FastifyInstance,
  service: LessonProductsService,
) {
  app.get(
    '/api/institutions/:institutionId/lesson-packages',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) =>
      service.list(
        parse(institutionParams, request.params).institutionId,
        parse(lessonPackageListQuerySchema, request.query),
      ),
  );
  app.get(
    '/api/institutions/:institutionId/lesson-packages/:packageId',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) => {
      const params = parse(packageParams, request.params);
      return service.get(params.institutionId, params.packageId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-packages',
    { config: { access: educationAccess('education.lesson-packages.manage') } },
    async (request, reply) => {
      const result = await service.create(
        parse(institutionParams, request.params).institutionId,
        parse(createLessonPackageRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.patch(
    '/api/institutions/:institutionId/lesson-packages/:packageId',
    { config: { access: educationAccess('education.lesson-packages.manage') } },
    async (request) => {
      const params = parse(packageParams, request.params);
      return service.update(
        params.institutionId,
        params.packageId,
        parse(updateLessonPackageRequestSchema, request.body),
        actor(request),
      );
    },
  );
}

function educationAccess(permission: string) {
  return {
    permissions: [permission],
    education: { institutionParam: 'institutionId', permission },
  } as const;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
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
