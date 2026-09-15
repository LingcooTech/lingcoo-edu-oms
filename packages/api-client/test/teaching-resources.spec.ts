import { createTeachingResourcesApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';

const campusId = '11111111-1111-4111-8111-111111111111';
const classroomId = '22222222-2222-4222-8222-222222222222';
const institutionId = '33333333-3333-4333-8333-333333333333';
const courseId = '44444444-4444-4444-8444-444444444444';
const classGroupId = '55555555-5555-4555-8555-555555555555';
const scheduleId = '66666666-6666-4666-8666-666666666666';
const sessionId = '77777777-7777-4777-8777-777777777777';
const teacherId = '88888888-8888-4888-8888-888888888888';
const studentId = '99999999-9999-4999-8999-999999999999';
const now = '2026-09-08T10:00:00+08:00';
const courseSeriesId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const campus = {
  id: campusId,
  name: '成长空间',
  code: null,
  address: null,
  latitude: null,
  longitude: null,
  environmentImageUrls: [],
  status: 'active',
  notes: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const classroom = {
  id: classroomId,
  campusId,
  name: '一号教室',
  code: null,
  capacity: 12,
  status: 'active',
  notes: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const course = {
  id: courseId,
  institutionId,
  code: null,
  name: '成长课程',
  category: null,
  ageRange: null,
  durationMinutes: 90,
  summary: null,
  status: 'active',
  sortOrder: 0,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const classGroup = {
  id: classGroupId,
  institutionId,
  name: '周末班',
  courseId: null,
  campusId: null,
  classroomId: null,
  capacity: 12,
  status: 'active',
  notes: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const schedule = {
  id: scheduleId,
  institutionId,
  name: '秋季周末计划',
  sessionName: '周末成长课',
  courseId: null,
  classGroupId: null,
  campusId: null,
  classroomId: null,
  timeZone: 'Asia/Shanghai',
  startDate: '2026-09-12',
  endDate: '2026-12-31',
  weekdays: [6, 7],
  startTime: '09:30',
  durationMinutes: 90,
  defaultUnits: 1,
  status: 'active',
  revision: 1,
  createdAt: now,
  updatedAt: now,
};
const session = {
  id: sessionId,
  institutionId,
  name: '周末成长课',
  startsAt: now,
  endsAt: '2026-09-08T11:30:00+08:00',
  status: 'draft',
  source: 'schedule',
  defaultUnits: 1,
  notes: null,
  cancellationReason: null,
  openedAt: null,
  completedAt: null,
  cancelledAt: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bodyAt(fetch: ReturnType<typeof vi.fn>, index: number) {
  return JSON.parse(String(fetch.mock.calls[index]?.[1]?.body)) as unknown;
}

describe('P6 teaching resources api client', () => {
  it('manages institution course series and associates courses optionally', async () => {
    const series = {
      id: courseSeriesId,
      institutionId,
      name: '硬笔书法',
      code: 'HP',
      slug: 'hard-pen',
      description: null,
      status: 'active',
      sortOrder: 0,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [series], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response(series, 201))
      .mockResolvedValueOnce(response({ ...series, name: '书法系列', revision: 2 }))
      .mockResolvedValueOnce(response({ accepted: true }));
    const api = createTeachingResourcesApi(createApiClient({ fetch }));

    await api.listCourseSeries(institutionId);
    await api.createCourseSeries(institutionId, { name: '硬笔书法', code: 'HP' });
    await api.updateCourseSeries(institutionId, courseSeriesId, {
      expectedRevision: 1,
      name: '书法系列',
    });
    await api.deleteCourseSeries(institutionId, courseSeriesId, { expectedRevision: 2 });

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `/api/institutions/${institutionId}/course-series?page=1&pageSize=20`,
      `/api/institutions/${institutionId}/course-series`,
      `/api/institutions/${institutionId}/course-series/${courseSeriesId}`,
      `/api/institutions/${institutionId}/course-series/${courseSeriesId}`,
    ]);
    expect(bodyAt(fetch, 1)).toMatchObject({ name: '硬笔书法', code: 'HP' });
    expect(fetch.mock.calls[3]?.[1]?.method).toBe('DELETE');
  });

  it('covers organization, campus and institution resource endpoints', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [campus], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response(campus))
      .mockResolvedValueOnce(response(campus, 201))
      .mockResolvedValueOnce(response(campus))
      .mockResolvedValueOnce(response({ items: [classroom], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response(classroom, 201))
      .mockResolvedValueOnce(response(classroom))
      .mockResolvedValueOnce(response({ items: [course], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response(course, 201))
      .mockResolvedValueOnce(response(course))
      .mockResolvedValueOnce(response({ items: [classGroup], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response(classGroup, 201))
      .mockResolvedValueOnce(response(classGroup));
    const api = createTeachingResourcesApi(createApiClient({ fetch }));

    await api.listCampuses({ page: 2, pageSize: 10, search: '成长 空间', status: 'active' });
    await api.getCampus(campusId);
    await api.createCampus({ name: '成长空间' });
    await api.updateCampus(campusId, { expectedRevision: 1, name: '新空间' });
    await api.listClassrooms(campusId);
    await api.createClassroom(campusId, { name: '一号教室', capacity: 12 });
    await api.updateClassroom(campusId, classroomId, { expectedRevision: 1, capacity: 14 });
    await api.listCourses(institutionId, { status: 'active' });
    await api.createCourse(institutionId, { name: '成长课程', durationMinutes: 90 });
    await api.updateCourse(institutionId, courseId, { expectedRevision: 1, status: 'inactive' });
    await api.listClassGroups(institutionId, { campusId });
    await api.createClassGroup(institutionId, { name: '周末班', capacity: 12 });
    await api.updateClassGroup(institutionId, classGroupId, {
      expectedRevision: 1,
      name: '新周末班',
    });

    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      '/api/campuses?page=2&pageSize=10&search=%E6%88%90%E9%95%BF+%E7%A9%BA%E9%97%B4&status=active',
      `/api/campuses/${campusId}`,
      '/api/campuses',
      `/api/campuses/${campusId}`,
      `/api/campuses/${campusId}/classrooms?page=1&pageSize=20`,
      `/api/campuses/${campusId}/classrooms`,
      `/api/campuses/${campusId}/classrooms/${classroomId}`,
      `/api/institutions/${institutionId}/courses?page=1&pageSize=20&status=active`,
      `/api/institutions/${institutionId}/courses`,
      `/api/institutions/${institutionId}/courses/${courseId}`,
      `/api/institutions/${institutionId}/classes?page=1&pageSize=20&campusId=${campusId}`,
      `/api/institutions/${institutionId}/classes`,
      `/api/institutions/${institutionId}/classes/${classGroupId}`,
    ]);
    expect(fetch.mock.calls[7]?.[0]).toBe(
      `/api/institutions/${institutionId}/courses?page=1&pageSize=20&status=active`,
    );
    expect(fetch.mock.calls[8]?.[0]).toBe(`/api/institutions/${institutionId}/courses`);
    expect(fetch.mock.calls[9]?.[0]).toBe(`/api/institutions/${institutionId}/courses/${courseId}`);
    expect(fetch.mock.calls[10]?.[0]).toBe(
      `/api/institutions/${institutionId}/classes?page=1&pageSize=20&campusId=${campusId}`,
    );
    expect(fetch.mock.calls[11]?.[0]).toBe(`/api/institutions/${institutionId}/classes`);
    expect(fetch.mock.calls[12]?.[0]).toBe(
      `/api/institutions/${institutionId}/classes/${classGroupId}`,
    );
    expect(bodyAt(fetch, 2)).toMatchObject({
      name: '成长空间',
      environmentImageUrls: [],
      status: 'active',
    });
    expect(bodyAt(fetch, 8)).toMatchObject({
      name: '成长课程',
      durationMinutes: 90,
      status: 'draft',
      sortOrder: 0,
    });
  });

  it('covers memberships, schedules, generation semantics and session resource context', async () => {
    const membership = {
      classGroupId,
      institutionId,
      studentId,
      studentNameSnapshot: '林同学',
      status: 'active',
      joinedAt: now,
      leftAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const assignment = {
      scheduleId,
      institutionId,
      teacherId,
      teacherNameSnapshot: '王老师',
      role: 'instructor',
      createdAt: now,
      updatedAt: now,
    };
    const context = {
      sessionId,
      institutionId,
      scheduleId,
      scheduleName: schedule.name,
      courseId: null,
      courseName: null,
      classGroupId: null,
      classGroupName: null,
      campusId: null,
      campusName: null,
      classroomId: null,
      classroomName: null,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [membership], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response({ items: [membership] }))
      .mockResolvedValueOnce(response({ items: [schedule], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response(schedule, 201))
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response({ schedule, items: [assignment] }))
      .mockResolvedValueOnce(response({ schedule, items: [assignment] }))
      .mockResolvedValueOnce(
        response({
          schedule,
          createdSessions: [session],
          skippedDates: ['2026-09-19'],
          conflicts: [],
        }),
      )
      .mockResolvedValueOnce(
        response({ schedule, createdSessions: [session], skippedDates: [], conflicts: [] }),
      )
      .mockResolvedValueOnce(response(context))
      .mockResolvedValueOnce(response(context));
    const api = createTeachingResourcesApi(createApiClient({ fetch }));

    await api.listClassStudents(institutionId, classGroupId, { page: 2, pageSize: 10 });
    await api.replaceClassStudents(institutionId, classGroupId, {
      expectedRevision: 1,
      studentIds: [studentId],
    });
    await api.listSchedules(institutionId, { fromDate: '2026-09-01', status: 'active' });
    await api.createSchedule(institutionId, {
      name: schedule.name,
      sessionName: schedule.sessionName,
      timeZone: schedule.timeZone,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      weekdays: schedule.weekdays,
      startTime: schedule.startTime,
      durationMinutes: schedule.durationMinutes,
      defaultUnits: schedule.defaultUnits,
    });
    await api.updateSchedule(institutionId, scheduleId, { expectedRevision: 1, name: '更新计划' });
    await api.listScheduleTeachers(institutionId, scheduleId);
    await api.replaceScheduleTeachers(institutionId, scheduleId, {
      expectedRevision: 1,
      assignments: [{ teacherId, role: 'instructor' }],
    });
    await api.generateSchedule(institutionId, scheduleId, { expectedRevision: 1 });
    await api.generateSchedule(institutionId, scheduleId, {
      expectedRevision: 1,
      includeClassStudents: true,
      fromDate: '2026-09-12',
      toDate: '2026-09-30',
      allowConflicts: true,
      conflictReason: '已确认空间可复用',
    });
    await api.getSessionResourceContext(institutionId, sessionId);
    await api.updateSessionResourceContext(institutionId, sessionId, {
      expectedRevision: 1,
      scheduleId,
      campusId: null,
    });

    expect(fetch.mock.calls.map((call) => call[1]?.method ?? 'GET')).toEqual([
      'GET',
      'PUT',
      'GET',
      'POST',
      'PATCH',
      'GET',
      'PUT',
      'POST',
      'POST',
      'GET',
      'PUT',
    ]);
    expect(bodyAt(fetch, 1)).toEqual({ expectedRevision: 1, studentIds: [studentId] });
    expect(bodyAt(fetch, 7)).toEqual({
      expectedRevision: 1,
      includeClassStudents: false,
      allowConflicts: false,
      conflictReason: null,
    });
    expect(bodyAt(fetch, 8)).toMatchObject({
      expectedRevision: 1,
      includeClassStudents: true,
      allowConflicts: true,
      conflictReason: '已确认空间可复用',
    });
    expect(fetch.mock.calls[7]?.[0]).toBe(
      `/api/institutions/${institutionId}/schedules/${scheduleId}/generate`,
    );
    expect(fetch.mock.calls[8]?.[0]).toBe(
      `/api/institutions/${institutionId}/schedules/${scheduleId}/generate`,
    );
    expect(fetch.mock.calls[10]?.[0]).toBe(
      `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/resources`,
    );
  });
});
