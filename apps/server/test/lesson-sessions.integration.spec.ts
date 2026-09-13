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
import {
  lessonAccounts,
  lessonBatches,
  lessonMovementAllocations,
  lessonMovements,
} from '../src/modules/lesson-accounts/infrastructure/persistence/lesson-accounts.schema.js';
import {
  teachingSessionAttendances,
  teachingSessionTeachers,
} from '../src/modules/lesson-sessions/infrastructure/persistence/lesson-sessions.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /p4_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /p4_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `p4_session=${session}; p4_csrf=${csrf}`, csrf };
}

suite('P4 lesson session attendance and consumption', () => {
  let database: DatabaseHandle;
  let identity: IdentityService;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerHeaders: ReturnType<typeof cookies>;
  const userIds: string[] = [];

  async function cleanup() {
    await database.db.execute(sql`truncate table
      teaching_session_attendances,
      teaching_sessions,
      lesson_movement_allocations,
      lesson_batches,
      lesson_movements,
      lesson_accounts,
      lesson_package_versions,
      lesson_package_templates,
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

  function writeHeaders() {
    return { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf };
  }

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: process.env.P4_TEST_LOG_LEVEL ?? 'silent',
      AUTH_COOKIE_NAME: 'p4_session',
      AUTH_CSRF_COOKIE_NAME: 'p4_csrf',
    });
    database = createDatabase(environment.DATABASE_URL);
    if (!new URL(environment.DATABASE_URL).pathname.endsWith('_p4_test')) {
      throw new Error('P4 integration tests require a dedicated database ending in _p4_test');
    }
    identity = createIdentityService({ database, environment });
    const audit = createAuditService({ database });
    const access = createAccessControlService({ database, identity, audit });
    await cleanup();
    await access.synchronizeSystemAccess();
    const owner = await identity.createUser({
      email: `p4-owner-${randomUUID()}@example.com`,
      password: 'p4-secure-password',
    });
    userIds.push(owner.id);
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'p4-secure-password' },
    });
    expect(login.statusCode, login.body).toBe(200);
    ownerHeaders = cookies(login.headers['set-cookie']);
  });

  afterAll(async () => {
    if (!database || !app) return;
    await cleanup();
    await app.close();
  });

  it('runs the session, attendance, consumption, reversal and failure lifecycle safely', async () => {
    const institutionResponse = await app.inject({
      method: 'POST',
      url: '/api/institutions',
      headers: writeHeaders(),
      payload: { name: `P4 课次机构-${randomUUID()}`, type: 'self_operated' },
    });
    expect(institutionResponse.statusCode, institutionResponse.body).toBe(201);
    const institutionId = institutionResponse.json().id as string;
    const otherInstitutionResponse = await app.inject({
      method: 'POST',
      url: '/api/institutions',
      headers: writeHeaders(),
      payload: { name: `P4 隔离机构-${randomUUID()}`, type: 'partner' },
    });
    expect(otherInstitutionResponse.statusCode, otherInstitutionResponse.body).toBe(201);
    const otherInstitutionId = otherInstitutionResponse.json().id as string;

    const studentResponse = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/students`,
      headers: writeHeaders(),
      payload: { fullName: 'P4 消课测试学员' },
    });
    expect(studentResponse.statusCode, studentResponse.body).toBe(201);
    const studentId = studentResponse.json().id as string;
    const otherStudentResponse = await app.inject({
      method: 'POST',
      url: `/api/institutions/${otherInstitutionId}/students`,
      headers: writeHeaders(),
      payload: { fullName: 'P4 其他机构学员' },
    });
    expect(otherStudentResponse.statusCode, otherStudentResponse.body).toBe(201);
    const otherStudentId = otherStudentResponse.json().id as string;

    const grant = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/students/${studentId}/lesson-grants`,
      headers: {
        ...writeHeaders(),
        'idempotency-key': randomUUID(),
        'x-expected-account-revision': '1',
      },
      payload: { templateId: null, baseUnits: 3, source: 'custom', reason: 'P4 测试课时' },
    });
    expect(grant.statusCode, grant.body).toBe(201);
    expect(grant.json().account.balanceUnits).toBe(3);
    const batchId = grant.json().affectedBatches[0].id as string;

    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 7_200_000).toISOString();
    const sessionResponse = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions`,
      headers: writeHeaders(),
      payload: {
        institutionId,
        name: 'P4 灵活课次',
        startsAt,
        endsAt,
        source: 'ad_hoc',
        defaultUnits: 2,
        notes: '不依赖课程、教师或教室',
      },
    });
    expect(sessionResponse.statusCode, sessionResponse.body).toBe(201);
    const sessionId = sessionResponse.json().id as string;

    const added = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, studentIds: [studentId] },
    });
    expect(added.statusCode, added.body).toBe(201);
    expect(added.json().session.revision).toBe(2);
    const rosterEntryId = added.json().roster.items[0].id as string;

    const crossInstitutionSession = await app.inject({
      method: 'GET',
      url: `/api/institutions/${otherInstitutionId}/lesson-sessions/${sessionId}`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(crossInstitutionSession.statusCode, crossInstitutionSession.body).toBe(404);
    const crossInstitutionRoster = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster`,
      headers: writeHeaders(),
      payload: { expectedRevision: 2, studentIds: [otherStudentId] },
    });
    expect(crossInstitutionRoster.statusCode, crossInstitutionRoster.body).toBe(404);
    expect(crossInstitutionRoster.json().error.code).toBe('STUDENT_INSTITUTION_NOT_ACTIVE');

    await expect(
      database.db.insert(teachingSessionAttendances).values({
        sessionId,
        institutionId,
        studentId: otherStudentId,
        studentNameSnapshot: '跨机构学员',
        plannedUnits: 1,
      }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(teachingSessionAttendances).values({
        sessionId,
        institutionId: otherInstitutionId,
        studentId: otherStudentId,
        studentNameSnapshot: '跨机构课次',
        plannedUnits: 1,
      }),
    ).rejects.toThrow();

    const opened = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/open`,
      headers: writeHeaders(),
      payload: { expectedRevision: 2 },
    });
    expect(opened.statusCode, opened.body).toBe(200);
    expect(opened.json()).toMatchObject({ status: 'open', revision: 3 });

    const prematureComplete = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/complete`,
      headers: writeHeaders(),
      payload: { expectedRevision: 3 },
    });
    expect(prematureComplete.statusCode, prematureComplete.body).toBe(409);
    expect(prematureComplete.json().error.code).toBe('LESSON_SESSION_ATTENDANCE_PENDING');

    const absent = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/attendance`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, attendanceStatus: 'absent' },
    });
    expect(absent.statusCode, absent.body).toBe(200);

    const rejectedConsumption = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption`,
      headers: writeHeaders(),
      payload: { operationId: randomUUID(), expectedRevision: 2, units: 2, reason: null },
    });
    expect(rejectedConsumption.statusCode, rejectedConsumption.body).toBe(409);
    expect(rejectedConsumption.json().error.code).toBe('ATTENDANCE_NOT_CONSUMABLE');

    const present = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/attendance`,
      headers: writeHeaders(),
      payload: { expectedRevision: 2, attendanceStatus: 'present' },
    });
    expect(present.statusCode, present.body).toBe(200);
    expect(present.json().revision).toBe(3);

    const consumeOperationId = randomUUID();
    const consumed = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption`,
      headers: writeHeaders(),
      payload: { operationId: consumeOperationId, expectedRevision: 3, units: 2, reason: null },
    });
    expect(consumed.statusCode, consumed.body).toBe(200);
    expect(consumed.json()).toMatchObject({
      rosterEntry: { consumptionStatus: 'consumed', consumedUnits: 2, revision: 4 },
      errorCode: null,
    });
    const consumptionMovementId = consumed.json().movementId as string;

    const replay = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption`,
      headers: writeHeaders(),
      payload: { operationId: consumeOperationId, expectedRevision: 3, units: 2, reason: null },
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().movementId).toBe(consumptionMovementId);

    const accountAfterConsume = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/students/${studentId}/lesson-account`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(accountAfterConsume.json().balanceUnits).toBe(1);

    const cancellationBlocked = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/cancel`,
      headers: writeHeaders(),
      payload: { expectedRevision: 3, reason: '验证有效消课阻止取消' },
    });
    expect(cancellationBlocked.statusCode, cancellationBlocked.body).toBe(409);
    expect(cancellationBlocked.json().error.code).toBe('LESSON_SESSION_HAS_CONSUMPTIONS');

    const completed = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/complete`,
      headers: writeHeaders(),
      payload: { expectedRevision: 3 },
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({ status: 'completed', revision: 4 });

    const reversalOperationId = randomUUID();
    const reversed = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption/reversal`,
      headers: writeHeaders(),
      payload: { operationId: reversalOperationId, expectedRevision: 4, reason: '操作纠错' },
    });
    expect(reversed.statusCode, reversed.body).toBe(200);
    expect(reversed.json().rosterEntry).toMatchObject({
      consumptionStatus: 'reversed',
      consumedUnits: 2,
      revision: 5,
    });
    expect(reversed.json().movementId).not.toBe(consumptionMovementId);

    const reversalReplay = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption/reversal`,
      headers: writeHeaders(),
      payload: { operationId: reversalOperationId, expectedRevision: 4, reason: '操作纠错' },
    });
    expect(reversalReplay.statusCode, reversalReplay.body).toBe(200);
    expect(reversalReplay.json().movementId).toBe(reversed.json().movementId);

    const correctedConsumption = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption`,
      headers: writeHeaders(),
      payload: {
        operationId: randomUUID(),
        expectedRevision: 5,
        units: 1,
        reason: '改为扣 1 课时',
      },
    });
    expect(correctedConsumption.statusCode, correctedConsumption.body).toBe(200);
    expect(correctedConsumption.json().rosterEntry).toMatchObject({
      consumptionStatus: 'consumed',
      consumedUnits: 1,
      revision: 6,
    });
    const correctedReversal = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/roster/${rosterEntryId}/consumption/reversal`,
      headers: writeHeaders(),
      payload: { operationId: randomUUID(), expectedRevision: 6, reason: '恢复测试期初余额' },
    });
    expect(correctedReversal.statusCode, correctedReversal.body).toBe(200);
    expect(correctedReversal.json().rosterEntry).toMatchObject({
      consumptionStatus: 'reversed',
      consumedUnits: 1,
      revision: 7,
    });

    const restoredAccount = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/students/${studentId}/lesson-account`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(restoredAccount.json().balanceUnits).toBe(3);

    const [batch] = await database.db
      .select()
      .from(lessonBatches)
      .where(sql`${lessonBatches.id} = ${batchId}`);
    expect(batch).toMatchObject({ remainingUnits: 3, consumedUnits: 0 });
    const [originalMovement] = await database.db
      .select()
      .from(lessonMovements)
      .where(sql`${lessonMovements.id} = ${consumptionMovementId}`);
    const [reversalMovement] = await database.db
      .select()
      .from(lessonMovements)
      .where(sql`${lessonMovements.relatedMovementId} = ${consumptionMovementId}`);
    expect(originalMovement).toMatchObject({ type: 'consume', direction: 'debit', units: 2 });
    expect(reversalMovement).toMatchObject({
      type: 'consume_reversal',
      direction: 'credit',
      units: 2,
    });
    const allocations = await database.db
      .select()
      .from(lessonMovementAllocations)
      .where(sql`${lessonMovementAllocations.movementId} = ${consumptionMovementId}`);
    expect(allocations).toMatchObject([{ batchId, units: 2 }]);

    const failureSession = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions`,
      headers: writeHeaders(),
      payload: {
        institutionId,
        name: 'P4 余额不足课次',
        startsAt,
        endsAt,
        source: 'manual',
        defaultUnits: 5,
        notes: null,
      },
    });
    const failureSessionId = failureSession.json().id as string;
    const failureAdded = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${failureSessionId}/roster`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, studentIds: [studentId] },
    });
    const failureRosterId = failureAdded.json().roster.items[0].id as string;
    await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${failureSessionId}/open`,
      headers: writeHeaders(),
      payload: { expectedRevision: 2 },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/lesson-sessions/${failureSessionId}/roster/${failureRosterId}/attendance`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, attendanceStatus: 'present' },
    });
    const failedConsumption = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${failureSessionId}/roster/${failureRosterId}/consumption`,
      headers: writeHeaders(),
      payload: { operationId: randomUUID(), expectedRevision: 2, units: 5, reason: null },
    });
    expect(failedConsumption.statusCode, failedConsumption.body).toBe(200);
    expect(failedConsumption.json().rosterEntry.consumptionStatus).toBe('failed');
    expect(failedConsumption.json().errorCode).toBe('LESSON_BALANCE_INSUFFICIENT');

    const cancelledAfterFailure = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${failureSessionId}/cancel`,
      headers: writeHeaders(),
      payload: { expectedRevision: 3, reason: '余额不足后取消' },
    });
    expect(cancelledAfterFailure.statusCode, cancelledAfterFailure.body).toBe(200);
    expect(cancelledAfterFailure.json()).toMatchObject({
      status: 'cancelled',
      cancellationReason: '余额不足后取消',
    });

    const [failedRecord] = await database.db
      .select()
      .from(teachingSessionAttendances)
      .where(sql`${teachingSessionAttendances.id} = ${failureRosterId}`);
    expect(failedRecord).toMatchObject({ consumedUnits: 0, consumptionMovementId: null });
    const [storedAccount] = await database.db
      .select()
      .from(lessonAccounts)
      .where(sql`${lessonAccounts.id} = ${restoredAccount.json().id}`);
    expect(storedAccount!.balanceUnits).toBe(3);
  });

  it('isolates assigned teacher sessions and saves bulk attendance atomically', async () => {
    const institutionResponse = await app.inject({
      method: 'POST',
      url: '/api/institutions',
      headers: writeHeaders(),
      payload: { name: `P5 教师机构-${randomUUID()}`, type: 'self_operated' },
    });
    expect(institutionResponse.statusCode, institutionResponse.body).toBe(201);
    const institutionId = institutionResponse.json().id as string;

    const rolesResponse = await app.inject({
      method: 'GET',
      url: '/api/access/roles',
      headers: { cookie: ownerHeaders.cookie },
    });
    const teacherRole = (rolesResponse.json().items as Array<{ id: string; key: string }>).find(
      (role) => role.key === 'teacher',
    );
    expect(teacherRole).toBeDefined();
    const teacherEmail = `p5-teacher-${randomUUID()}@example.com`;
    const teacherPassword = 'p5-teacher-secure-password';
    const teacherUserResponse = await app.inject({
      method: 'POST',
      url: '/api/access/users',
      headers: writeHeaders(),
      payload: {
        email: teacherEmail,
        password: teacherPassword,
        displayName: 'P5 点名教师',
        mustChangePassword: false,
        roleIds: [teacherRole!.id],
      },
    });
    expect(teacherUserResponse.statusCode, teacherUserResponse.body).toBe(201);
    const teacherUserId = teacherUserResponse.json().id as string;
    userIds.push(teacherUserId);

    const teacherResponse = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/teachers`,
      headers: writeHeaders(),
      payload: {
        fullName: 'P5 点名教师',
        email: null,
        phone: null,
        identityUserId: teacherUserId,
      },
    });
    expect(teacherResponse.statusCode, teacherResponse.body).toBe(201);
    const teacherId = teacherResponse.json().id as string;

    const assignmentResponse = await app.inject({
      method: 'PUT',
      url: `/api/access/users/${teacherUserId}/education-assignments`,
      headers: writeHeaders(),
      payload: {
        assignments: [{ role: 'teacher', institutionId, teacherId, active: true }],
      },
    });
    expect(assignmentResponse.statusCode, assignmentResponse.body).toBe(200);

    const studentIds: string[] = [];
    for (const fullName of ['P5 学员甲', 'P5 学员乙']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/institutions/${institutionId}/students`,
        headers: writeHeaders(),
        payload: { fullName },
      });
      expect(response.statusCode, response.body).toBe(201);
      studentIds.push(response.json().id as string);
    }

    const startsAt = new Date(Date.now() + 3_600_000).toISOString();
    const endsAt = new Date(Date.now() + 7_200_000).toISOString();
    const createSession = async (name: string) => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/institutions/${institutionId}/lesson-sessions`,
        headers: writeHeaders(),
        payload: { institutionId, name, startsAt, endsAt, defaultUnits: 1 },
      });
      expect(response.statusCode, response.body).toBe(201);
      return response.json().id as string;
    };
    const assignedSessionId = await createSession('P5 本人课次');
    const unassignedSessionId = await createSession('P5 他人课次');

    const rosterResponse = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/roster`,
      headers: writeHeaders(),
      payload: { expectedRevision: 1, studentIds },
    });
    expect(rosterResponse.statusCode, rosterResponse.body).toBe(201);
    const rosterItems = rosterResponse.json().roster.items as Array<{ id: string }>;

    const teacherAssignmentResponse = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/teachers`,
      headers: writeHeaders(),
      payload: {
        expectedRevision: 2,
        assignments: [{ teacherId, role: 'instructor' }],
      },
    });
    expect(teacherAssignmentResponse.statusCode, teacherAssignmentResponse.body).toBe(200);
    expect(teacherAssignmentResponse.json()).toMatchObject({
      session: { revision: 3 },
      items: [{ teacherId, teacherNameSnapshot: 'P5 点名教师', role: 'instructor' }],
    });

    const otherInstitutionResponse = await app.inject({
      method: 'POST',
      url: '/api/institutions',
      headers: writeHeaders(),
      payload: { name: `P5 隔离机构-${randomUUID()}`, type: 'partner' },
    });
    const otherInstitutionId = otherInstitutionResponse.json().id as string;
    await expect(
      database.db.insert(teachingSessionTeachers).values({
        sessionId: unassignedSessionId,
        institutionId: otherInstitutionId,
        teacherId,
        teacherNameSnapshot: '跨机构教师',
      }),
    ).rejects.toThrow();

    const openedResponse = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/open`,
      headers: writeHeaders(),
      payload: { expectedRevision: 3 },
    });
    expect(openedResponse.statusCode, openedResponse.body).toBe(200);

    const nativeLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/native/login',
      payload: { identifier: teacherEmail, password: teacherPassword },
    });
    expect(nativeLogin.statusCode, nativeLogin.body).toBe(200);
    const nativeIdentity = nativeLogin.json() as { accessToken: string; csrfToken: string };
    const teacherHeaders = {
      authorization: `Bearer ${nativeIdentity.accessToken}`,
      'x-csrf-token': nativeIdentity.csrfToken,
    };

    const contextResponse = await app.inject({
      method: 'GET',
      url: '/api/access/education-context',
      headers: teacherHeaders,
    });
    expect(contextResponse.statusCode, contextResponse.body).toBe(200);
    expect(contextResponse.json().items).toMatchObject([
      { role: 'teacher', institutionId, teacherId, active: true },
    ]);

    const workbenchResponse = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/lesson-session-workbench?page=1&pageSize=100`,
      headers: teacherHeaders,
    });
    expect(workbenchResponse.statusCode, workbenchResponse.body).toBe(200);
    expect(workbenchResponse.json()).toMatchObject({
      total: 1,
      items: [
        {
          session: { id: assignedSessionId, status: 'open' },
          attendance: { total: 2, pending: 2 },
          consumption: { notConsumed: 2, consumed: 0, reversed: 0, failed: 0, consumedUnits: 0 },
          teachers: [{ teacherId }],
        },
      ],
    });

    const deniedUnassigned = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/lesson-sessions/${unassignedSessionId}`,
      headers: teacherHeaders,
    });
    expect(deniedUnassigned.statusCode, deniedUnassigned.body).toBe(404);

    const partialFailure = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/attendances`,
      headers: teacherHeaders,
      payload: {
        items: [
          {
            rosterEntryId: rosterItems[0]!.id,
            expectedRevision: 1,
            attendanceStatus: 'present',
          },
          {
            rosterEntryId: rosterItems[1]!.id,
            expectedRevision: 99,
            attendanceStatus: 'late',
          },
        ],
      },
    });
    expect(partialFailure.statusCode, partialFailure.body).toBe(409);

    const rosterAfterRollback = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/roster`,
      headers: teacherHeaders,
    });
    expect(rosterAfterRollback.statusCode, rosterAfterRollback.body).toBe(200);
    expect(rosterAfterRollback.json().items).toMatchObject([
      { attendanceStatus: 'pending', revision: 1 },
      { attendanceStatus: 'pending', revision: 1 },
    ]);

    const recorded = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/attendances`,
      headers: teacherHeaders,
      payload: {
        items: rosterItems.map((item, index) => ({
          rosterEntryId: item.id,
          expectedRevision: 1,
          attendanceStatus: index === 0 ? 'present' : 'late',
        })),
      },
    });
    expect(recorded.statusCode, recorded.body).toBe(200);
    expect(recorded.json().items).toMatchObject([
      { attendanceStatus: 'present', revision: 2 },
      { attendanceStatus: 'late', revision: 2 },
    ]);

    const deniedTeacherManagement = await app.inject({
      method: 'PUT',
      url: `/api/institutions/${institutionId}/lesson-sessions/${assignedSessionId}/teachers`,
      headers: teacherHeaders,
      payload: { expectedRevision: 4, assignments: [] },
    });
    expect(deniedTeacherManagement.statusCode, deniedTeacherManagement.body).toBe(403);
  });
});
