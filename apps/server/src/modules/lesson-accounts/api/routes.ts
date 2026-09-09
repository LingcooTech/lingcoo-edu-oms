import { ApiError } from '@lingcoo-tech/http';
import {
  adjustLessonUnitsRequestSchema,
  clawbackLessonUnitsRequestSchema,
  grantLessonUnitsRequestSchema,
  lessonAccountMutationHeadersSchema,
  lessonBatchListQuerySchema,
  lessonMovementListQuerySchema,
  reverseLessonGrantRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { LessonAccountsService } from '../application/lesson-accounts.service.js';

const studentParams = z.object({ institutionId: z.uuid(), studentId: z.uuid() });
const batchParams = studentParams.extend({ batchId: z.uuid() });

export async function registerLessonAccountsRoutes(
  app: FastifyInstance,
  service: LessonAccountsService,
) {
  app.get(
    '/api/institutions/:institutionId/students/:studentId/lesson-account',
    { config: { access: educationAccess('education.lesson-balances.read') } },
    async (request) => {
      const params = parse(studentParams, request.params);
      return service.get(params.institutionId, params.studentId, scope(request));
    },
  );
  app.get(
    '/api/institutions/:institutionId/students/:studentId/lesson-account/batches',
    { config: { access: educationAccess('education.lesson-balances.read') } },
    async (request) => {
      const params = parse(studentParams, request.params);
      return service.listBatches(
        params.institutionId,
        params.studentId,
        parse(lessonBatchListQuerySchema, request.query),
        scope(request),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/students/:studentId/lesson-account/movements',
    { config: { access: educationAccess('education.lesson-balances.read') } },
    async (request) => {
      const params = parse(studentParams, request.params);
      return service.listMovements(
        params.institutionId,
        params.studentId,
        parse(lessonMovementListQuerySchema, request.query),
        scope(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/students/:studentId/lesson-grants',
    { config: { access: educationAccess('education.lesson-balances.manage') } },
    async (request, reply) => {
      const params = parse(studentParams, request.params);
      const result = await service.grant(
        params.institutionId,
        params.studentId,
        parse(grantLessonUnitsRequestSchema, request.body),
        scope(request),
        mutationIdentity(request),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.post(
    '/api/institutions/:institutionId/students/:studentId/lesson-adjustments',
    { config: { access: educationAccess('education.lesson-balances.manage') } },
    async (request) => {
      const params = parse(studentParams, request.params);
      return service.adjust(
        params.institutionId,
        params.studentId,
        parse(adjustLessonUnitsRequestSchema, request.body),
        scope(request),
        mutationIdentity(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/students/:studentId/lesson-batches/:batchId/clawbacks',
    { config: { access: educationAccess('education.lesson-balances.manage') } },
    async (request) => {
      const params = parse(batchParams, request.params);
      return service.clawback(
        params.institutionId,
        params.studentId,
        params.batchId,
        parse(clawbackLessonUnitsRequestSchema, request.body),
        scope(request),
        mutationIdentity(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/students/:studentId/lesson-batches/:batchId/reversal',
    { config: { access: educationAccess('education.lesson-balances.manage') } },
    async (request) => {
      const params = parse(batchParams, request.params);
      return service.reverseGrant(
        params.institutionId,
        params.studentId,
        params.batchId,
        parse(reverseLessonGrantRequestSchema, request.body),
        scope(request),
        mutationIdentity(request),
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

function scope(request: FastifyRequest) {
  if (!request.educationScope) {
    throw new ApiError(403, 'ACCESS_SCOPE_REQUIRED', '缺少教务数据范围');
  }
  return request.educationScope;
}

function mutationIdentity(request: FastifyRequest) {
  const headers = parse(lessonAccountMutationHeadersSchema, {
    'idempotency-key': firstHeader(request.headers['idempotency-key']),
    'x-expected-account-revision': firstHeader(request.headers['x-expected-account-revision']),
  });
  return {
    idempotencyKey: headers['idempotency-key'],
    expectedAccountRevision: headers['x-expected-account-revision'],
  };
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function actor(request: FastifyRequest) {
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
