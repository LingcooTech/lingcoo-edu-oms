import { randomUUID } from 'node:crypto';

import { inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { accessUserRoles } from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import { createAccessControlService } from '../src/modules/access-control/public.js';
import { createAuditService } from '../src/modules/audit/public.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { createIdentityService, type IdentityService } from '../src/modules/identity/public.js';
import { peopleTeacherInstitutions } from '../src/modules/people/infrastructure/persistence/people.schema.js';
import { teachingSessions } from '../src/modules/lesson-sessions/infrastructure/persistence/lesson-sessions.schema.js';
import {
  teachingResourceClassGroups,
  teachingResourceClassMemberships,
  teachingResourceScheduleOccurrences,
  teachingResourceSchedules,
} from '../src/modules/teaching-resources/infrastructure/persistence/teaching-resources.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /p6_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /p6_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `p6_session=${session}; p6_csrf=${csrf}`, csrf };
}

suite('P6 teaching resources and scheduling', () => {
  let database: DatabaseHandle;
  let identity: IdentityService;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerHeaders: ReturnType<typeof cookies>;
  const userIds: string[] = [];

  function writeHeaders() {
    return { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf };
  }

  async function cleanup() {
    await database.db.execute(sql`truncate table
      teaching_resource_schedule_occurrences,
      teaching_session_resource_contexts,
      teaching_resource_schedule_teachers,
      teaching_resource_schedules,
      teaching_resource_class_memberships,
      teaching_resource_class_groups,
      teaching_resource_courses,
      teaching_resource_classrooms,
      teaching_resource_campuses,
      teaching_session_teachers,
      teaching_session_attendances,
      teaching_sessions,
      people_student_guardians,
      people_teacher_institutions,
      people_student_institutions,
      people_guardians,
      people_teachers,
      people_students,
      organization_institutions
      cascade`);
    if (userIds.length) {
      await database.db.delete(accessUserRoles).where(inArray(accessUserRoles.userId, userIds));
      await database.db
        .delete(identityActionTokens)
        .where(inArray(identityActionTokens.userId, userIds));
      await database.db.delete(identitySessions).where(inArray(identitySessions.userId, userIds));
      await database.db
        .delete(identityPasswordCredentials)
        .where(inArray(identityPasswordCredentials.userId, userIds));
      await database.db.delete(identityUsers).where(inArray(identityUsers.id, userIds));
    }
  }

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      AUTH_COOKIE_NAME: 'p6_session',
      AUTH_CSRF_COOKIE_NAME: 'p6_csrf',
    });
    database = createDatabase(environment.DATABASE_URL);
    if (!new URL(environment.DATABASE_URL).pathname.endsWith('_p6_test')) {
      throw new Error('P6 integration tests require a dedicated database ending in _p6_test');
    }
    identity = createIdentityService({ database, environment });
    const audit = createAuditService({ database });
    const access = createAccessControlService({ database, identity, audit });
    await cleanup();
    await access.synchronizeSystemAccess();
    const owner = await identity.createUser({
      email: `p6-owner-${randomUUID()}@example.com`,
      password: 'p6-secure-password',
    });
    userIds.push(owner.id);
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'p6-secure-password' },
    });
    expect(login.statusCode, login.body).toBe(200);
    ownerHeaders = cookies(login.headers['set-cookie']);
  });

  afterAll(async () => {
    if (!database || !app) return;
    await cleanup();
    await app.close();
  });

  it('keeps resources optional and enforces institution and physical boundaries', async () => {
    const institutionA = await createInstitution('P6 自营机构');
    const institutionB = await createInstitution('P6 合作机构');
    const studentA = await createStudent(institutionA, 'P6 学员甲');
    const studentB = await createStudent(institutionB, 'P6 学员乙');

    const resourceFree = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/lesson-sessions`,
      headers: writeHeaders(),
      payload: {
        institutionId: institutionA,
        name: 'P6 无资源课次',
        startsAt: '2030-01-01T02:00:00.000Z',
        endsAt: '2030-01-01T03:00:00.000Z',
        defaultUnits: 1,
      },
    });
    expect(resourceFree.statusCode, resourceFree.body).toBe(201);
    const emptyContext = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionA}/lesson-sessions/${resourceFree.json().id}/resources`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(emptyContext.statusCode, emptyContext.body).toBe(200);
    expect(emptyContext.json()).toMatchObject({
      sessionId: resourceFree.json().id,
      courseId: null,
      classGroupId: null,
      campusId: null,
      classroomId: null,
    });

    const campusA = await createCampus('P6 城东校区');
    const campusB = await createCampus('P6 城西校区');
    const classroomA = await createClassroom(campusA.id, 'P6 A101');
    const classroomB = await createClassroom(campusB.id, 'P6 B101');
    const courseA = await createCourse(institutionA, 'P6 美术课');
    const courseB = await createCourse(institutionB, 'P6 书法课');

    const crossCourseClass = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/classes`,
      headers: writeHeaders(),
      payload: { name: '跨机构课程班', courseId: courseB.id, capacity: 20 },
    });
    expect(crossCourseClass.statusCode, crossCourseClass.body).toBe(404);
    expect(crossCourseClass.json().error.code).toBe('COURSE_NOT_FOUND');

    const mismatch = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/classes`,
      headers: writeHeaders(),
      payload: {
        name: '物理位置错误班',
        campusId: campusA.id,
        classroomId: classroomB.id,
        capacity: 20,
      },
    });
    expect(mismatch.statusCode, mismatch.body).toBe(409);
    expect(mismatch.json().error.code).toBe('CLASSROOM_CAMPUS_MISMATCH');

    const classGroup = await createClass(
      institutionA,
      'P6 创意班',
      courseA.id,
      campusA.id,
      classroomA.id,
    );
    const crossMember = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionA}/classes/${classGroup.id}/students`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, studentIds: [studentB] },
    });
    expect(crossMember.statusCode, crossMember.body).toBe(404);
    expect(crossMember.json().error.code).toBe('STUDENT_INSTITUTION_NOT_ACTIVE');

    await expect(
      database.db.insert(teachingResourceClassGroups).values({
        institutionId: institutionA,
        name: '数据库跨机构班',
        courseId: courseB.id,
        capacity: 10,
      }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(teachingResourceClassMemberships).values({
        classGroupId: classGroup.id,
        institutionId: institutionA,
        studentId: studentB,
        studentNameSnapshot: '跨机构学员',
      }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(teachingResourceSchedules).values({
        institutionId: institutionA,
        name: '数据库跨机构排课',
        sessionName: '数据库跨机构课次',
        courseId: courseB.id,
        timeZone: 'Asia/Shanghai',
        startDate: '2030-01-01',
        endDate: '2030-01-01',
        weekdays: [2],
        startTime: '10:00:00',
        durationMinutes: 60,
        defaultUnits: 1,
      }),
    ).rejects.toThrow();

    expect(studentA).toBeTruthy();
  });

  it('generates atomically with opt-in roster, snapshots, idempotency and conflict override', async () => {
    const institutionId = await createInstitution('P6 排课机构');
    const studentId = await createStudent(institutionId, 'P6 排课学员');
    const teacherId = await createTeacher(institutionId, 'P6 排课教师');
    const campus = await createCampus('P6 排课校区');
    const classroom = await createClassroom(campus.id, 'P6 排课教室');
    const course = await createCourse(institutionId, 'P6 编程课');
    const classGroup = await createClass(
      institutionId,
      'P6 编程一班',
      course.id,
      campus.id,
      classroom.id,
    );
    const members = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionId}/classes/${classGroup.id}/students`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, studentIds: [studentId] },
    });
    expect(members.statusCode, members.body).toBe(200);
    expect(members.json().items).toMatchObject([
      { studentId, studentNameSnapshot: 'P6 排课学员', status: 'active', leftAt: null },
    ]);

    const schedule = await createSchedule(institutionId, {
      name: 'P6 每周排课',
      sessionName: 'P6 编程训练',
      courseId: course.id,
      classGroupId: classGroup.id,
      campusId: campus.id,
      classroomId: classroom.id,
      timeZone: 'Asia/Shanghai',
      startDate: '2030-01-07',
      endDate: '2030-01-09',
      weekdays: [1, 2, 3],
      startTime: '10:00',
      durationMinutes: 60,
      defaultUnits: 1,
    });
    const assigned = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionId}/schedules/${schedule.id}/teachers`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, assignments: [{ teacherId, role: 'instructor' }] },
    });
    expect(assigned.statusCode, assigned.body).toBe(200);
    expect(assigned.json().schedule.revision).toBe(2);

    const defaultGeneration = await generate(institutionId, schedule.id, {
      expectedRevision: 2,
      fromDate: '2030-01-07',
      toDate: '2030-01-07',
    });
    expect(defaultGeneration.statusCode, defaultGeneration.body).toBe(200);
    expect(defaultGeneration.json().createdSessions).toHaveLength(1);
    const emptyRosterSessionId = defaultGeneration.json().createdSessions[0].id as string;
    expect(await rosterSize(institutionId, emptyRosterSessionId)).toBe(0);

    const copiedGeneration = await generate(institutionId, schedule.id, {
      expectedRevision: 2,
      fromDate: '2030-01-08',
      toDate: '2030-01-08',
      includeClassStudents: true,
    });
    expect(copiedGeneration.statusCode, copiedGeneration.body).toBe(200);
    const copiedSessionId = copiedGeneration.json().createdSessions[0].id as string;
    expect(await rosterSize(institutionId, copiedSessionId)).toBe(1);
    const copiedTeachers = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/lesson-sessions/${copiedSessionId}/teachers`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(copiedTeachers.json().items).toMatchObject([
      { teacherId, teacherNameSnapshot: 'P6 排课教师', role: 'instructor' },
    ]);

    const repeated = await generate(institutionId, schedule.id, {
      expectedRevision: 2,
      fromDate: '2030-01-08',
      toDate: '2030-01-08',
      includeClassStudents: true,
    });
    expect(repeated.statusCode, repeated.body).toBe(200);
    expect(repeated.json()).toMatchObject({ createdSessions: [], skippedDates: ['2030-01-08'] });

    const contextBeforeRename = await sessionContext(institutionId, copiedSessionId);
    expect(contextBeforeRename).toMatchObject({
      scheduleName: 'P6 每周排课',
      courseName: 'P6 编程课',
      classGroupName: 'P6 编程一班',
      campusName: 'P6 排课校区',
      classroomName: 'P6 排课教室',
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/campuses/${campus.id}`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, name: 'P6 新校区名' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/campuses/${campus.id}/classrooms/${classroom.id}`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, name: 'P6 新教室名' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/courses/${course.id}`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, name: 'P6 新课程名' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/classes/${classGroup.id}`,
      headers: writeHeaders(),
      payload: { expectedRevision: 2, name: 'P6 新班级名' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/schedules/${schedule.id}`,
      headers: writeHeaders(),
      payload: { expectedRevision: 2, name: 'P6 新排课名' },
    });
    expect(await sessionContext(institutionId, copiedSessionId)).toEqual(contextBeforeRename);

    const conflicting = await createSchedule(institutionId, {
      name: 'P6 冲突排课',
      sessionName: 'P6 冲突课次',
      campusId: campus.id,
      classroomId: classroom.id,
      timeZone: 'Asia/Shanghai',
      startDate: '2030-01-08',
      endDate: '2030-01-10',
      weekdays: [2, 4],
      startTime: '10:30',
      durationMinutes: 30,
      defaultUnits: 1,
    });
    const conflictTeachers = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionId}/schedules/${conflicting.id}/teachers`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, assignments: [{ teacherId, role: 'instructor' }] },
    });
    expect(conflictTeachers.statusCode, conflictTeachers.body).toBe(200);
    const sessionsBefore = await sessionCount('P6 冲突课次');
    const rejected = await generate(institutionId, conflicting.id, {
      expectedRevision: 2,
      includeClassStudents: true,
    });
    expect(rejected.statusCode, rejected.body).toBe(409);
    expect(rejected.json().error.code).toBe('SCHEDULE_CONFLICT');
    expect(await sessionCount('P6 冲突课次')).toBe(sessionsBefore);
    expect(
      await database.db
        .select()
        .from(teachingResourceScheduleOccurrences)
        .where(sql`${teachingResourceScheduleOccurrences.scheduleId} = ${conflicting.id}`),
    ).toHaveLength(0);

    const overridden = await generate(institutionId, conflicting.id, {
      expectedRevision: 2,
      allowConflicts: true,
      conflictReason: '经过负责人确认临时共用资源',
    });
    expect(overridden.statusCode, overridden.body).toBe(200);
    expect(overridden.json().createdSessions).toHaveLength(2);
    expect(overridden.json().conflicts.length).toBeGreaterThan(0);
  });

  it('rejects shared classroom and teacher conflicts across institutions on manual assignment', async () => {
    const institutionA = await createInstitution('P6 共享资源机构甲');
    const institutionB = await createInstitution('P6 共享资源机构乙');
    const campus = await createCampus('P6 共享校区');
    const classroom = await createClassroom(campus.id, 'P6 共享教室');

    const roomSessionA = await createManualSession(
      institutionA,
      'P6 教室占用甲',
      '2031-01-02T02:00:00.000Z',
      '2031-01-02T03:00:00.000Z',
    );
    const roomSessionB = await createManualSession(
      institutionB,
      'P6 教室占用乙',
      '2031-01-02T02:30:00.000Z',
      '2031-01-02T03:30:00.000Z',
    );
    const firstRoom = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionA}/lesson-sessions/${roomSessionA}/resources`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, campusId: campus.id, classroomId: classroom.id },
    });
    expect(firstRoom.statusCode, firstRoom.body).toBe(200);
    const conflictingRoom = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionB}/lesson-sessions/${roomSessionB}/resources`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, campusId: campus.id, classroomId: classroom.id },
    });
    expect(conflictingRoom.statusCode, conflictingRoom.body).toBe(409);
    expect(conflictingRoom.json().error.code).toBe('LESSON_SESSION_CLASSROOM_CONFLICT');
    const movableRoomSession = await createManualSession(
      institutionB,
      'P6 教室时间调整',
      '2031-01-02T04:00:00.000Z',
      '2031-01-02T05:00:00.000Z',
    );
    const movableRoom = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionB}/lesson-sessions/${movableRoomSession}/resources`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, campusId: campus.id, classroomId: classroom.id },
    });
    expect(movableRoom.statusCode, movableRoom.body).toBe(200);
    const roomTimeConflict = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionB}/lesson-sessions/${movableRoomSession}`,
      headers: writeHeaders(),
      payload: {
        expectedRevision: 2,
        startsAt: '2031-01-02T02:30:00.000Z',
        endsAt: '2031-01-02T03:30:00.000Z',
      },
    });
    expect(roomTimeConflict.statusCode, roomTimeConflict.body).toBe(409);
    expect(roomTimeConflict.json().error.code).toBe('LESSON_SESSION_CLASSROOM_CONFLICT');

    const teacherId = await createTeacher(institutionA, 'P6 共享教师');
    await database.db.insert(peopleTeacherInstitutions).values({
      teacherId,
      institutionId: institutionB,
    });
    const teacherSessionA = await createManualSession(
      institutionA,
      'P6 教师占用甲',
      '2031-01-03T02:00:00.000Z',
      '2031-01-03T03:00:00.000Z',
    );
    const teacherSessionB = await createManualSession(
      institutionB,
      'P6 教师占用乙',
      '2031-01-03T02:30:00.000Z',
      '2031-01-03T03:30:00.000Z',
    );
    const firstTeacher = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionA}/lesson-sessions/${teacherSessionA}/teachers`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, assignments: [{ teacherId, role: 'instructor' }] },
    });
    expect(firstTeacher.statusCode, firstTeacher.body).toBe(200);
    const conflictingTeacher = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionB}/lesson-sessions/${teacherSessionB}/teachers`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, assignments: [{ teacherId, role: 'instructor' }] },
    });
    expect(conflictingTeacher.statusCode, conflictingTeacher.body).toBe(409);
    expect(conflictingTeacher.json().error.code).toBe('LESSON_SESSION_TEACHER_CONFLICT');
    const movableTeacherSession = await createManualSession(
      institutionB,
      'P6 教师时间调整',
      '2031-01-03T04:00:00.000Z',
      '2031-01-03T05:00:00.000Z',
    );
    const movableTeacher = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionB}/lesson-sessions/${movableTeacherSession}/teachers`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, assignments: [{ teacherId, role: 'instructor' }] },
    });
    expect(movableTeacher.statusCode, movableTeacher.body).toBe(200);
    const teacherTimeConflict = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionB}/lesson-sessions/${movableTeacherSession}`,
      headers: writeHeaders(),
      payload: {
        expectedRevision: 2,
        startsAt: '2031-01-03T02:30:00.000Z',
        endsAt: '2031-01-03T03:30:00.000Z',
      },
    });
    expect(teacherTimeConflict.statusCode, teacherTimeConflict.body).toBe(409);
    expect(teacherTimeConflict.json().error.code).toBe('LESSON_SESSION_TEACHER_CONFLICT');
  });

  async function createInstitution(name: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/institutions',
      headers: writeHeaders(),
      payload: { name: `${name}-${randomUUID()}`, type: 'self_operated' },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  }

  async function createStudent(institutionId: string, fullName: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/students`,
      headers: writeHeaders(),
      payload: { fullName },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  }

  async function createTeacher(institutionId: string, fullName: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/teachers`,
      headers: writeHeaders(),
      payload: { fullName, email: null, phone: null, identityUserId: null },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  }

  async function createCampus(name: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/campuses',
      headers: writeHeaders(),
      payload: { name, code: null },
    });
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json().id as string, name: response.json().name as string };
  }

  async function createClassroom(campusId: string, name: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/campuses/${campusId}/classrooms`,
      headers: writeHeaders(),
      payload: { name, code: null, capacity: 20 },
    });
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json().id as string };
  }

  async function createCourse(institutionId: string, name: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/courses`,
      headers: writeHeaders(),
      payload: { name, durationMinutes: 60, status: 'active' },
    });
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json().id as string };
  }

  async function createClass(
    institutionId: string,
    name: string,
    courseId: string,
    campusId: string,
    classroomId: string,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/classes`,
      headers: writeHeaders(),
      payload: { name, courseId, campusId, classroomId, capacity: 20, status: 'active' },
    });
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json().id as string };
  }

  async function createSchedule(institutionId: string, payload: Record<string, unknown>) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/schedules`,
      headers: writeHeaders(),
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    return { id: response.json().id as string };
  }

  async function createManualSession(
    institutionId: string,
    name: string,
    startsAt: string,
    endsAt: string,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions`,
      headers: writeHeaders(),
      payload: { institutionId, name, startsAt, endsAt, defaultUnits: 1 },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  }

  async function generate(
    institutionId: string,
    scheduleId: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/schedules/${scheduleId}/generate`,
      headers: writeHeaders(),
      payload,
    });
  }

  async function rosterSize(institutionId: string, sessionId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().items.length as number;
  }

  async function sessionContext(institutionId: string, sessionId: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/resources`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json();
  }

  async function sessionCount(name: string) {
    const rows = await database.db
      .select()
      .from(teachingSessions)
      .where(sql`${teachingSessions.name} = ${name}`);
    return rows.length;
  }
});
