import { ApiError } from '@lingcoo-tech/http';
import {
  bindExistingGuardianRequestSchema,
  createGuardianAndBindRequestSchema,
  createStudentRequestSchema,
  createStudentInstitutionRequestSchema,
  createTeacherRequestSchema,
  studentListQuerySchema,
  updateGuardianBindingRequestSchema,
  updateStudentInstitutionRequestSchema,
  updateStudentRequestSchema,
  updateTeacherRequestSchema,
  verifyGuardianBindingRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { PeopleService } from '../application/people.service.js';

const institutionParams = z.object({ institutionId: z.uuid() });
const studentParams = institutionParams.extend({ studentId: z.uuid() });
const bindingParams = studentParams.extend({ bindingId: z.uuid() });
const teacherParams = institutionParams.extend({ teacherId: z.uuid() });

export async function registerPeopleRoutes(app: FastifyInstance, service: PeopleService) {
  app.get(
    '/api/institutions/:institutionId/students',
    { config: { access: educationAccess('education.students.read') } },
    async (request) =>
      service.listStudents(parse(studentListQuerySchema, request.query), scope(request)),
  );
  app.post(
    '/api/institutions/:institutionId/students',
    { config: { access: educationAccess('education.students.manage') } },
    async (request, reply) => {
      const { institutionId } = parse(institutionParams, request.params);
      const result = await service.createStudent(
        institutionId,
        parse(createStudentRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.post(
    '/api/institutions/:institutionId/student-services',
    { config: { access: educationAccess('education.students.manage') } },
    async (request, reply) => {
      const result = await service.addStudentInstitution(
        parse(institutionParams, request.params).institutionId,
        parse(createStudentInstitutionRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.get(
    '/api/institutions/:institutionId/students/:studentId',
    { config: { access: educationAccess('education.students.read') } },
    async (request) =>
      service.getStudent(parse(studentParams, request.params).studentId, scope(request)),
  );
  app.patch(
    '/api/institutions/:institutionId/students/:studentId',
    { config: { access: educationAccess('education.students.manage') } },
    async (request) =>
      service.updateStudent(
        parse(studentParams, request.params).studentId,
        scope(request),
        parse(updateStudentRequestSchema, request.body),
        actor(request),
      ),
  );
  app.patch(
    '/api/institutions/:institutionId/students/:studentId/guardian-links/:bindingId/verification',
    { config: { access: educationAccess('education.guardians.manage') } },
    async (request) => {
      const params = parse(bindingParams, request.params);
      return service.verifyGuardianBinding(
        params.studentId,
        params.bindingId,
        scope(request),
        parse(verifyGuardianBindingRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/students/:studentId/service',
    { config: { access: educationAccess('education.students.manage') } },
    async (request) =>
      service.updateStudentInstitution(
        parse(studentParams, request.params).studentId,
        scope(request),
        parse(updateStudentInstitutionRequestSchema, request.body),
        actor(request),
      ),
  );
  app.get(
    '/api/institutions/:institutionId/students/:studentId/guardians',
    { config: { access: educationAccess('education.guardians.read') } },
    async (request) =>
      service.listGuardianBindings(parse(studentParams, request.params).studentId, scope(request)),
  );
  app.post(
    '/api/institutions/:institutionId/students/:studentId/guardians',
    { config: { access: educationAccess('education.guardians.manage') } },
    async (request, reply) => {
      const result = await service.createGuardianAndBind(
        parse(studentParams, request.params).studentId,
        scope(request),
        parse(createGuardianAndBindRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.post(
    '/api/institutions/:institutionId/students/:studentId/guardian-links',
    { config: { access: educationAccess('education.guardians.manage') } },
    async (request, reply) => {
      const result = await service.bindExistingGuardian(
        parse(studentParams, request.params).studentId,
        scope(request),
        parse(bindExistingGuardianRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.patch(
    '/api/institutions/:institutionId/students/:studentId/guardian-links/:bindingId',
    { config: { access: educationAccess('education.guardians.manage') } },
    async (request) => {
      const params = parse(bindingParams, request.params);
      return service.updateGuardianBinding(
        params.studentId,
        params.bindingId,
        scope(request),
        parse(updateGuardianBindingRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/teachers',
    { config: { access: educationAccess('education.teachers.read') } },
    async (request) => service.listTeachers(parse(institutionParams, request.params).institutionId),
  );
  app.post(
    '/api/institutions/:institutionId/teachers',
    { config: { access: educationAccess('education.teachers.manage') } },
    async (request, reply) => {
      const result = await service.createTeacher(
        parse(institutionParams, request.params).institutionId,
        parse(createTeacherRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.patch(
    '/api/institutions/:institutionId/teachers/:teacherId',
    { config: { access: educationAccess('education.teachers.manage') } },
    async (request) => {
      const params = parse(teacherParams, request.params);
      return service.updateTeacher(
        params.institutionId,
        params.teacherId,
        parse(updateTeacherRequestSchema, request.body),
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

function actor(request: FastifyRequest) {
  const user = request.identityPrincipal!.user;
  return auditContextFromRequest(request, {
    type: 'user',
    id: user.id,
    label: user.displayName ?? user.email ?? user.phone,
  });
}
