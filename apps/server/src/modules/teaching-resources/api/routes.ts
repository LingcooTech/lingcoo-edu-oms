import { ApiError } from '@lingcoo-tech/http';
import {
  campusListQuerySchema,
  classGroupListQuerySchema,
  classMembershipListQuerySchema,
  classroomListQuerySchema,
  courseSeriesListQuerySchema,
  courseListQuerySchema,
  createCampusRequestSchema,
  createClassGroupRequestSchema,
  createClassroomRequestSchema,
  createCourseSeriesRequestSchema,
  createCourseRequestSchema,
  deleteCourseSeriesRequestSchema,
  createScheduleRequestSchema,
  generateScheduleRequestSchema,
  replaceClassMembershipsRequestSchema,
  replaceScheduleTeachersRequestSchema,
  scheduleListQuerySchema,
  updateCampusRequestSchema,
  updateClassGroupRequestSchema,
  updateClassroomRequestSchema,
  updateCourseSeriesRequestSchema,
  updateCourseRequestSchema,
  updateScheduleRequestSchema,
  updateSessionResourceContextRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { TeachingResourcesService } from '../application/teaching-resources.service.js';

const campusParams = z.object({ campusId: z.uuid() });
const classroomParams = campusParams.extend({ classroomId: z.uuid() });
const institutionParams = z.object({ institutionId: z.uuid() });
const courseParams = institutionParams.extend({ courseId: z.uuid() });
const courseSeriesParams = institutionParams.extend({ courseSeriesId: z.uuid() });
const classParams = institutionParams.extend({ classGroupId: z.uuid() });
const scheduleParams = institutionParams.extend({ scheduleId: z.uuid() });
const sessionParams = institutionParams.extend({ sessionId: z.uuid() });

export async function registerTeachingResourcesRoutes(
  app: FastifyInstance,
  service: TeachingResourcesService,
) {
  app.get(
    '/api/campuses',
    { config: { access: globalAccess('education.teaching-resources.read') } },
    async (request) => service.listCampuses(parse(campusListQuerySchema, request.query)),
  );
  app.get(
    '/api/campuses/:campusId',
    { config: { access: globalAccess('education.teaching-resources.read') } },
    async (request) => service.getCampus(parse(campusParams, request.params).campusId),
  );
  app.post(
    '/api/campuses',
    { config: { access: globalAccess('education.teaching-resources.manage') } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await service.createCampus(
            parse(createCampusRequestSchema, request.body),
            actor(request),
          ),
        ),
  );
  app.patch(
    '/api/campuses/:campusId',
    { config: { access: globalAccess('education.teaching-resources.manage') } },
    async (request) => {
      const params = parse(campusParams, request.params);
      return service.updateCampus(
        params.campusId,
        parse(updateCampusRequestSchema, request.body),
        actor(request),
      );
    },
  );

  app.get(
    '/api/campuses/:campusId/classrooms',
    { config: { access: globalAccess('education.teaching-resources.read') } },
    async (request) => {
      const params = parse(campusParams, request.params);
      return service.listClassrooms(
        params.campusId,
        parse(classroomListQuerySchema, request.query),
      );
    },
  );
  app.post(
    '/api/campuses/:campusId/classrooms',
    { config: { access: globalAccess('education.teaching-resources.manage') } },
    async (request, reply) => {
      const params = parse(campusParams, request.params);
      return reply
        .code(201)
        .send(
          await service.createClassroom(
            params.campusId,
            parse(createClassroomRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.patch(
    '/api/campuses/:campusId/classrooms/:classroomId',
    { config: { access: globalAccess('education.teaching-resources.manage') } },
    async (request) => {
      const params = parse(classroomParams, request.params);
      return service.updateClassroom(
        params.campusId,
        params.classroomId,
        parse(updateClassroomRequestSchema, request.body),
        actor(request),
      );
    },
  );

  app.get(
    '/api/institutions/:institutionId/course-series',
    { config: { access: educationAccess('education.courses.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listCourseSeries(
        params.institutionId,
        parse(courseSeriesListQuerySchema, request.query),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/course-series/:courseSeriesId',
    { config: { access: educationAccess('education.courses.read') } },
    async (request) => {
      const params = parse(courseSeriesParams, request.params);
      return service.getCourseSeries(params.institutionId, params.courseSeriesId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/course-series',
    { config: { access: educationAccess('education.courses.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      return reply
        .code(201)
        .send(
          await service.createCourseSeries(
            params.institutionId,
            parse(createCourseSeriesRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/course-series/:courseSeriesId',
    { config: { access: educationAccess('education.courses.manage') } },
    async (request) => {
      const params = parse(courseSeriesParams, request.params);
      return service.updateCourseSeries(
        params.institutionId,
        params.courseSeriesId,
        parse(updateCourseSeriesRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.delete(
    '/api/institutions/:institutionId/course-series/:courseSeriesId',
    { config: { access: educationAccess('education.courses.manage') } },
    async (request) => {
      const params = parse(courseSeriesParams, request.params);
      await service.deleteCourseSeries(
        params.institutionId,
        params.courseSeriesId,
        parse(deleteCourseSeriesRequestSchema, request.body).expectedRevision,
        actor(request),
      );
      return { accepted: true } as const;
    },
  );

  app.get(
    '/api/institutions/:institutionId/courses',
    { config: { access: educationAccess('education.courses.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listCourses(params.institutionId, parse(courseListQuerySchema, request.query));
    },
  );
  app.post(
    '/api/institutions/:institutionId/courses',
    { config: { access: educationAccess('education.courses.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      return reply
        .code(201)
        .send(
          await service.createCourse(
            params.institutionId,
            parse(createCourseRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/courses/:courseId',
    { config: { access: educationAccess('education.courses.manage') } },
    async (request) => {
      const params = parse(courseParams, request.params);
      return service.updateCourse(
        params.institutionId,
        params.courseId,
        parse(updateCourseRequestSchema, request.body),
        actor(request),
      );
    },
  );

  app.get(
    '/api/institutions/:institutionId/classes',
    { config: { access: educationAccess('education.classes.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listClassGroups(
        params.institutionId,
        parse(classGroupListQuerySchema, request.query),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/classes',
    { config: { access: educationAccess('education.classes.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      return reply
        .code(201)
        .send(
          await service.createClassGroup(
            params.institutionId,
            parse(createClassGroupRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/classes/:classGroupId',
    { config: { access: educationAccess('education.classes.manage') } },
    async (request) => {
      const params = parse(classParams, request.params);
      return service.updateClassGroup(
        params.institutionId,
        params.classGroupId,
        parse(updateClassGroupRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/classes/:classGroupId/students',
    { config: { access: educationAccess('education.classes.read') } },
    async (request) => {
      const params = parse(classParams, request.params);
      const query = parse(classMembershipListQuerySchema, request.query);
      return service.listClassMemberships(
        params.institutionId,
        params.classGroupId,
        query.page,
        query.pageSize,
      );
    },
  );
  app.put(
    '/api/institutions/:institutionId/classes/:classGroupId/students',
    { config: { access: educationAccess('education.classes.manage') } },
    async (request) => {
      const params = parse(classParams, request.params);
      return service.replaceClassMemberships(
        params.institutionId,
        params.classGroupId,
        parse(replaceClassMembershipsRequestSchema, request.body),
        actor(request),
      );
    },
  );

  app.get(
    '/api/institutions/:institutionId/schedules',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listSchedules(
        params.institutionId,
        parse(scheduleListQuerySchema, request.query),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/schedules',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      return reply
        .code(201)
        .send(
          await service.createSchedule(
            params.institutionId,
            parse(createScheduleRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/schedules/:scheduleId',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(scheduleParams, request.params);
      return service.updateSchedule(
        params.institutionId,
        params.scheduleId,
        parse(updateScheduleRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/schedules/:scheduleId/teachers',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(scheduleParams, request.params);
      return service.listScheduleTeachers(params.institutionId, params.scheduleId);
    },
  );
  app.put(
    '/api/institutions/:institutionId/schedules/:scheduleId/teachers',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(scheduleParams, request.params);
      return service.replaceScheduleTeachers(
        params.institutionId,
        params.scheduleId,
        parse(replaceScheduleTeachersRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/schedules/:scheduleId/generate',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(scheduleParams, request.params);
      return service.generate(
        params.institutionId,
        params.scheduleId,
        parse(generateScheduleRequestSchema, request.body),
        actor(request),
      );
    },
  );

  app.get(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/resources',
    { config: { access: educationAccess('education.sessions.read') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.getSessionResourceContext(params.institutionId, params.sessionId);
    },
  );
  app.put(
    '/api/institutions/:institutionId/lesson-sessions/:sessionId/resources',
    { config: { access: educationAccess('education.sessions.manage') } },
    async (request) => {
      const params = parse(sessionParams, request.params);
      return service.updateSessionResourceContext(
        params.institutionId,
        params.sessionId,
        parse(updateSessionResourceContextRequestSchema, request.body),
        actor(request),
      );
    },
  );
}

function globalAccess(permission: string) {
  return { permissions: [permission], allowUnscopedEducation: true } as const;
}

function educationAccess(permission: string) {
  return {
    permissions: [permission],
    education: { institutionParam: 'institutionId', permission },
  } as const;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  return result.data;
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
