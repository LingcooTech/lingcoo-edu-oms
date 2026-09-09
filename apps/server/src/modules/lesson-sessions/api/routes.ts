import { ApiError } from '@lingcoo-tech/http';
import {
  addLessonSessionStudentsRequestSchema,
  cancelLessonSessionRequestSchema,
  completeLessonSessionRequestSchema,
  consumeLessonSessionStudentRequestSchema,
  consumeLessonSessionStudentsRequestSchema,
  createLessonSessionRequestSchema,
  lessonSessionListQuerySchema,
  openLessonSessionRequestSchema,
  recordLessonSessionAttendanceRequestSchema,
  recordLessonSessionAttendancesRequestSchema,
  replaceLessonSessionTeachersRequestSchema,
  reverseLessonSessionConsumptionRequestSchema,
  updateLessonSessionRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { LessonSessionsService } from '../application/lesson-sessions.service.js';

const institutionParams = z.object({ institutionId: z.uuid() });
const sessionParams = institutionParams.extend({ sessionId: z.uuid() });
const rosterParams = sessionParams.extend({ rosterEntryId: z.uuid() });

export async function registerLessonSessionsRoutes(
  app: FastifyInstance,
  service: LessonSessionsService,
) {
  app.get(
    '/api/institutions/:institutionId/lesson-sessions',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.list(
        params.institutionId,
        parse(lessonSessionListQuerySchema, request.query),
        scope(request),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/lesson-session-workbench',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.workbench(
        params.institutionId,
        parse(lessonSessionListQuerySchema, request.query),
        scope(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      const result = await service.create(
        params.institutionId,
        parse(createLessonSessionRequestSchema, request.body),
        scope(request),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.get(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.get(params.institutionId, params.sessionId, scope(request));
    },
  );
  app.patch(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.update(
        params.institutionId,
        params.sessionId,
        parse(updateLessonSessionRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/open',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.open(
        params.institutionId,
        params.sessionId,
        parse(openLessonSessionRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/complete',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.complete(
        params.institutionId,
        params.sessionId,
        parse(completeLessonSessionRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/cancel',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.cancel(
        params.institutionId,
        params.sessionId,
        parse(cancelLessonSessionRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/roster',
    { config: { access: educationAccess('education.attendance.read') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.roster(params.institutionId, params.sessionId, scope(request));
    },
  );
  app.get(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/teachers',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.listTeachers(params.institutionId, params.sessionId, scope(request));
    },
  );
  app.put(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/teachers',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.replaceTeachers(
        params.institutionId,
        params.sessionId,
        parse(replaceLessonSessionTeachersRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/roster',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request, reply) => {
      const params = parse(sessionParams, request.params);
      const result = await service.addStudents(
        params.institutionId,
        params.sessionId,
        parse(addLessonSessionStudentsRequestSchema, request.body),
        scope(request),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.patch(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/roster/:rosterEntryId/attendance',
    { config: { access: educationAccess('education.attendance.manage') } },
    async (request) => {
      const params = parse(rosterParams, request.params);
      return service.recordAttendance(
        params.institutionId,
        params.sessionId,
        params.rosterEntryId,
        parse(recordLessonSessionAttendanceRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/attendances',
    { config: { access: educationAccess('education.attendance.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.recordAttendances(
        params.institutionId,
        params.sessionId,
        parse(recordLessonSessionAttendancesRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/roster/:rosterEntryId/consumption',
    {
      config: {
        access: educationAccess('education.lesson-balances.manage', [
          'education.attendance.manage',
        ]),
      },
    },
    async (request) => {
      const params = parse(rosterParams, request.params);
      return service.consume(
        params.institutionId,
        params.sessionId,
        params.rosterEntryId,
        parse(consumeLessonSessionStudentRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/consumptions',
    {
      config: {
        access: educationAccess('education.lesson-balances.manage', [
          'education.attendance.manage',
        ]),
      },
    },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.consumeMany(
        params.institutionId,
        params.sessionId,
        parse(consumeLessonSessionStudentsRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/roster/:rosterEntryId/consumption/reversal',
    {
      config: {
        access: educationAccess('education.lesson-balances.manage', [
          'education.attendance.manage',
        ]),
      },
    },
    async (request) => {
      const params = parse(rosterParams, request.params);
      return service.reverse(
        params.institutionId,
        params.sessionId,
        params.rosterEntryId,
        parse(reverseLessonSessionConsumptionRequestSchema, request.body),
        scope(request),
        actor(request),
      );
    },
  );
}

function educationAccess(permission: string, additional: string[] = []) {
  return {
    permissions: [permission, ...additional],
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
  if (!request.educationScope) throw new ApiError(403, 'ACCESS_SCOPE_REQUIRED', '缺少教务数据范围');
  return request.educationScope;
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
