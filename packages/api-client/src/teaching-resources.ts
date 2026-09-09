import {
  campusListQuerySchema,
  campusPageSchema,
  campusSchema,
  classGroupListQuerySchema,
  classGroupPageSchema,
  classGroupSchema,
  classMembershipListSchema,
  classMembershipListQuerySchema,
  classMembershipPageSchema,
  classroomListQuerySchema,
  classroomPageSchema,
  classroomSchema,
  courseListQuerySchema,
  coursePageSchema,
  courseSchema,
  createCampusRequestSchema,
  createClassGroupRequestSchema,
  createClassroomRequestSchema,
  createCourseRequestSchema,
  createScheduleRequestSchema,
  generateScheduleRequestSchema,
  generateScheduleResponseSchema,
  replaceClassMembershipsRequestSchema,
  replaceScheduleTeachersRequestSchema,
  scheduleListQuerySchema,
  schedulePageSchema,
  scheduleSchema,
  scheduleTeachersSchema,
  sessionResourceContextSchema,
  updateCampusRequestSchema,
  updateClassGroupRequestSchema,
  updateClassroomRequestSchema,
  updateCourseRequestSchema,
  updateScheduleRequestSchema,
  updateSessionResourceContextRequestSchema,
  idSchema,
  type CampusListQuery,
  type ClassGroupListQuery,
  type ClassroomListQuery,
  type CourseListQuery,
  type CreateCampusRequest,
  type CreateClassGroupRequest,
  type CreateClassroomRequest,
  type CreateCourseRequest,
  type CreateScheduleRequest,
  type GenerateScheduleRequest,
  type ClassMembershipListQuery,
  type ReplaceClassMembershipsRequest,
  type ReplaceScheduleTeachersRequest,
  type ScheduleListQuery,
  type UpdateCampusRequest,
  type UpdateClassGroupRequest,
  type UpdateClassroomRequest,
  type UpdateCourseRequest,
  type UpdateScheduleRequest,
  type UpdateSessionResourceContextRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function queryString(input: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') {
      params.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function institutionPath(institutionId: string): string {
  return `/api/institutions/${pathId(institutionId)}`;
}

function campusPath(campusId: string): string {
  return `/api/campuses/${pathId(campusId)}`;
}

function classroomPath(campusId: string, classroomId: string): string {
  return `${campusPath(campusId)}/classrooms/${pathId(classroomId)}`;
}

function coursePath(institutionId: string, courseId: string): string {
  return `${institutionPath(institutionId)}/courses/${pathId(courseId)}`;
}

function classGroupPath(institutionId: string, classGroupId: string): string {
  return `${institutionPath(institutionId)}/classes/${pathId(classGroupId)}`;
}

function schedulePath(institutionId: string, scheduleId: string): string {
  return `${institutionPath(institutionId)}/schedules/${pathId(scheduleId)}`;
}

function sessionResourcePath(institutionId: string, sessionId: string): string {
  return `${institutionPath(institutionId)}/lesson-sessions/${pathId(sessionId)}/resources`;
}

export function createTeachingResourcesApi(client: ApiClient) {
  return {
    listCampuses(input: Partial<CampusListQuery> = {}) {
      const query = campusListQuerySchema.parse(input);
      return client.request({
        path: `/api/campuses${queryString(query)}`,
        schema: campusPageSchema,
      });
    },
    getCampus(campusId: string) {
      return client.request({ path: campusPath(campusId), schema: campusSchema });
    },
    createCampus(input: CreateCampusRequest) {
      return client.request({
        method: 'POST',
        path: '/api/campuses',
        body: createCampusRequestSchema.parse(input),
        schema: campusSchema,
      });
    },
    updateCampus(campusId: string, input: UpdateCampusRequest) {
      return client.request({
        method: 'PATCH',
        path: campusPath(campusId),
        body: updateCampusRequestSchema.parse(input),
        schema: campusSchema,
      });
    },
    listClassrooms(campusId: string, input: Partial<ClassroomListQuery> = {}) {
      const query = classroomListQuerySchema.parse(input);
      return client.request({
        path: `${campusPath(campusId)}/classrooms${queryString(query)}`,
        schema: classroomPageSchema,
      });
    },
    createClassroom(campusId: string, input: CreateClassroomRequest) {
      return client.request({
        method: 'POST',
        path: `${campusPath(campusId)}/classrooms`,
        body: createClassroomRequestSchema.parse(input),
        schema: classroomSchema,
      });
    },
    updateClassroom(campusId: string, classroomId: string, input: UpdateClassroomRequest) {
      return client.request({
        method: 'PATCH',
        path: classroomPath(campusId, classroomId),
        body: updateClassroomRequestSchema.parse(input),
        schema: classroomSchema,
      });
    },
    listCourses(institutionId: string, input: Partial<CourseListQuery> = {}) {
      const query = courseListQuerySchema.parse(input);
      return client.request({
        path: `${institutionPath(institutionId)}/courses${queryString(query)}`,
        schema: coursePageSchema,
      });
    },
    createCourse(institutionId: string, input: CreateCourseRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/courses`,
        body: createCourseRequestSchema.parse(input),
        schema: courseSchema,
      });
    },
    updateCourse(institutionId: string, courseId: string, input: UpdateCourseRequest) {
      return client.request({
        method: 'PATCH',
        path: coursePath(institutionId, courseId),
        body: updateCourseRequestSchema.parse(input),
        schema: courseSchema,
      });
    },
    listClassGroups(institutionId: string, input: Partial<ClassGroupListQuery> = {}) {
      const query = classGroupListQuerySchema.parse(input);
      return client.request({
        path: `${institutionPath(institutionId)}/classes${queryString(query)}`,
        schema: classGroupPageSchema,
      });
    },
    createClassGroup(institutionId: string, input: CreateClassGroupRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/classes`,
        body: createClassGroupRequestSchema.parse(input),
        schema: classGroupSchema,
      });
    },
    updateClassGroup(institutionId: string, classGroupId: string, input: UpdateClassGroupRequest) {
      return client.request({
        method: 'PATCH',
        path: classGroupPath(institutionId, classGroupId),
        body: updateClassGroupRequestSchema.parse(input),
        schema: classGroupSchema,
      });
    },
    listClassStudents(
      institutionId: string,
      classGroupId: string,
      input: Partial<ClassMembershipListQuery> = {},
    ) {
      const query = classMembershipListQuerySchema.parse(input);
      return client.request({
        path: `${classGroupPath(institutionId, classGroupId)}/students${queryString(query)}`,
        schema: classMembershipPageSchema,
      });
    },
    listClasses(institutionId: string, input: Partial<ClassGroupListQuery> = {}) {
      const query = classGroupListQuerySchema.parse(input);
      return client.request({
        path: `${institutionPath(institutionId)}/classes${queryString(query)}`,
        schema: classGroupPageSchema,
      });
    },
    createClass(institutionId: string, input: CreateClassGroupRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/classes`,
        body: createClassGroupRequestSchema.parse(input),
        schema: classGroupSchema,
      });
    },
    updateClass(institutionId: string, classGroupId: string, input: UpdateClassGroupRequest) {
      return client.request({
        method: 'PATCH',
        path: classGroupPath(institutionId, classGroupId),
        body: updateClassGroupRequestSchema.parse(input),
        schema: classGroupSchema,
      });
    },
    replaceClassStudents(
      institutionId: string,
      classGroupId: string,
      input: ReplaceClassMembershipsRequest,
    ) {
      return client.request({
        method: 'PUT',
        path: `${classGroupPath(institutionId, classGroupId)}/students`,
        body: replaceClassMembershipsRequestSchema.parse(input),
        schema: classMembershipListSchema,
      });
    },
    listSchedules(institutionId: string, input: Partial<ScheduleListQuery> = {}) {
      const query = scheduleListQuerySchema.parse(input);
      return client.request({
        path: `${institutionPath(institutionId)}/schedules${queryString(query)}`,
        schema: schedulePageSchema,
      });
    },
    createSchedule(institutionId: string, input: CreateScheduleRequest) {
      return client.request({
        method: 'POST',
        path: `${institutionPath(institutionId)}/schedules`,
        body: createScheduleRequestSchema.parse(input),
        schema: scheduleSchema,
      });
    },
    updateSchedule(institutionId: string, scheduleId: string, input: UpdateScheduleRequest) {
      return client.request({
        method: 'PATCH',
        path: schedulePath(institutionId, scheduleId),
        body: updateScheduleRequestSchema.parse(input),
        schema: scheduleSchema,
      });
    },
    listScheduleTeachers(institutionId: string, scheduleId: string) {
      return client.request({
        path: `${schedulePath(institutionId, scheduleId)}/teachers`,
        schema: scheduleTeachersSchema,
      });
    },
    replaceScheduleTeachers(
      institutionId: string,
      scheduleId: string,
      input: ReplaceScheduleTeachersRequest,
    ) {
      return client.request({
        method: 'PUT',
        path: `${schedulePath(institutionId, scheduleId)}/teachers`,
        body: replaceScheduleTeachersRequestSchema.parse(input),
        schema: scheduleTeachersSchema,
      });
    },
    generateSchedule(institutionId: string, scheduleId: string, input: GenerateScheduleRequest) {
      return client.request({
        method: 'POST',
        path: `${schedulePath(institutionId, scheduleId)}/generate`,
        body: generateScheduleRequestSchema.parse(input),
        schema: generateScheduleResponseSchema,
      });
    },
    getSessionResourceContext(institutionId: string, sessionId: string) {
      return client.request({
        path: sessionResourcePath(institutionId, sessionId),
        schema: sessionResourceContextSchema,
      });
    },
    updateSessionResourceContext(
      institutionId: string,
      sessionId: string,
      input: UpdateSessionResourceContextRequest,
    ) {
      return client.request({
        method: 'PUT',
        path: sessionResourcePath(institutionId, sessionId),
        body: updateSessionResourceContextRequestSchema.parse(input),
        schema: sessionResourceContextSchema,
      });
    },
  };
}

export type TeachingResourcesApi = ReturnType<typeof createTeachingResourcesApi>;
