import { createLessonSessionsApi } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from '../src/client.js';

const institutionId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const secondStudentId = '44444444-4444-4444-8444-444444444444';
const rosterEntryId = '55555555-5555-4555-8555-555555555555';
const secondRosterEntryId = '66666666-6666-4666-8666-666666666666';
const actorId = '77777777-7777-4777-8777-777777777777';
const movementId = '88888888-8888-4888-8888-888888888888';
const reversalMovementId = '99999999-9999-4999-8999-999999999999';
const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reversalOperationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const startsAt = '2026-09-07T09:00:00.000Z';
const endsAt = '2026-09-07T10:00:00.000Z';

const session = {
  id: sessionId,
  institutionId,
  name: '周日下午成长课',
  startsAt,
  endsAt,
  status: 'draft',
  source: 'manual',
  defaultUnits: 1,
  notes: null,
  cancellationReason: null,
  openedAt: null,
  completedAt: null,
  cancelledAt: null,
  revision: 1,
  createdAt: startsAt,
  updatedAt: startsAt,
};

const rosterEntry = {
  id: rosterEntryId,
  lessonSessionId: sessionId,
  institutionId,
  studentId,
  studentNameSnapshot: '林同学',
  attendanceStatus: 'pending',
  attendanceRecordedAt: null,
  attendanceRecordedBy: null,
  consumptionStatus: 'not_consumed',
  plannedUnits: 1,
  consumedUnits: null,
  movementId: null,
  reversalMovementId: null,
  consumptionOperationId: null,
  reversalOperationId: null,
  consumedAt: null,
  reversedAt: null,
  consumptionErrorCode: null,
  consumptionErrorMessage: null,
  revision: 1,
  createdAt: startsAt,
  updatedAt: startsAt,
};

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestBody(fetch: ReturnType<typeof vi.fn>, index: number) {
  return JSON.parse(String(fetch.mock.calls[index]?.[1]?.body)) as unknown;
}

describe('P4 lesson sessions api client', () => {
  it('covers list, detail, create, update and every lifecycle transition', async () => {
    const openSession = { ...session, status: 'open', openedAt: startsAt, revision: 3 };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [session], page: 2, pageSize: 10, total: 1 }))
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response(session, 201))
      .mockResolvedValueOnce(response({ ...session, name: '更新后的课次', revision: 2 }))
      .mockResolvedValueOnce(response(openSession))
      .mockResolvedValueOnce(
        response({ ...openSession, status: 'completed', completedAt: endsAt, revision: 4 }),
      )
      .mockResolvedValueOnce(
        response({
          ...session,
          status: 'cancelled',
          cancellationReason: '临时停课',
          cancelledAt: startsAt,
          revision: 2,
        }),
      );
    const api = createLessonSessionsApi(createApiClient({ fetch }));

    const page = await api.list(institutionId, {
      page: 2,
      pageSize: 10,
      search: '成长 课',
      status: 'draft',
      from: startsAt,
      to: endsAt,
    });
    await api.get(institutionId, sessionId);
    await api.create(institutionId, {
      institutionId,
      name: session.name,
      startsAt,
      endsAt,
      defaultUnits: 1,
    });
    await api.update(institutionId, sessionId, {
      expectedRevision: 1,
      name: '更新后的课次',
    });
    await api.open(institutionId, sessionId, { expectedRevision: 2 });
    await api.complete(institutionId, sessionId, { expectedRevision: 3 });
    await api.cancel(institutionId, sessionId, {
      expectedRevision: 1,
      reason: '临时停课',
    });

    const base = `/api/institutions/${institutionId}/lesson-sessions`;
    expect(page.items[0]?.id).toBe(sessionId);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `${base}?page=2&pageSize=10&search=%E6%88%90%E9%95%BF+%E8%AF%BE&status=draft&from=2026-09-07T09%3A00%3A00.000Z&to=2026-09-07T10%3A00%3A00.000Z`,
      `${base}/${sessionId}`,
      base,
      `${base}/${sessionId}`,
      `${base}/${sessionId}/open`,
      `${base}/${sessionId}/complete`,
      `${base}/${sessionId}/cancel`,
    ]);
    expect(fetch.mock.calls.map((call) => call[1]?.method)).toEqual([
      'GET',
      'GET',
      'POST',
      'PATCH',
      'POST',
      'POST',
      'POST',
    ]);
    expect(requestBody(fetch, 2)).toEqual({
      institutionId,
      name: session.name,
      startsAt,
      endsAt,
      source: 'manual',
      defaultUnits: 1,
      notes: null,
    });
    expect(requestBody(fetch, 6)).toEqual({ expectedRevision: 1, reason: '临时停课' });
  });

  it('covers roster querying/addition and single/bulk attendance', async () => {
    const present = {
      ...rosterEntry,
      attendanceStatus: 'present',
      attendanceRecordedAt: startsAt,
      attendanceRecordedBy: actorId,
      revision: 2,
    };
    const late = { ...present, id: secondRosterEntryId, studentId: secondStudentId };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [rosterEntry] }))
      .mockResolvedValueOnce(
        response({ session: { ...session, revision: 2 }, roster: { items: [rosterEntry] } }, 201),
      )
      .mockResolvedValueOnce(response(present))
      .mockResolvedValueOnce(response({ items: [present, late] }));
    const api = createLessonSessionsApi(createApiClient({ fetch }));

    const roster = await api.listRoster(institutionId, sessionId);
    const added = await api.addStudents(institutionId, sessionId, {
      expectedRevision: 1,
      studentIds: [studentId, secondStudentId],
    });
    await api.recordAttendance(institutionId, sessionId, rosterEntryId, {
      expectedRevision: 1,
      attendanceStatus: 'present',
    });
    await api.recordAttendances(institutionId, sessionId, {
      items: [
        { rosterEntryId, expectedRevision: 2, attendanceStatus: 'present' },
        { rosterEntryId: secondRosterEntryId, expectedRevision: 1, attendanceStatus: 'late' },
      ],
    });

    const base = `/api/institutions/${institutionId}/lesson-sessions/${sessionId}`;
    expect(roster.items[0]?.studentNameSnapshot).toBe('林同学');
    expect(added.session.revision).toBe(2);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `${base}/roster`,
      `${base}/roster`,
      `${base}/roster/${rosterEntryId}/attendance`,
      `${base}/attendances`,
    ]);
    expect(fetch.mock.calls.map((call) => call[1]?.method)).toEqual([
      'GET',
      'POST',
      'PATCH',
      'PATCH',
    ]);
    expect(requestBody(fetch, 1)).toEqual({
      expectedRevision: 1,
      studentIds: [studentId, secondStudentId],
    });
  });

  it('covers single/bulk consumption and reversal with operation evidence', async () => {
    const consumed = {
      ...rosterEntry,
      attendanceStatus: 'present',
      consumptionStatus: 'consumed',
      consumedUnits: 1,
      movementId,
      consumptionOperationId: operationId,
      consumedAt: startsAt,
      revision: 3,
    };
    const consumeResult = {
      rosterEntry: consumed,
      movementId,
      consumedAt: startsAt,
      reversedAt: null,
      errorCode: null,
      errorMessage: null,
    };
    const reversed = {
      ...consumed,
      consumptionStatus: 'reversed',
      reversalMovementId,
      reversalOperationId,
      reversedAt: endsAt,
      revision: 4,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(consumeResult))
      .mockResolvedValueOnce(
        response({
          operationId,
          items: [consumeResult, { ...consumeResult, rosterEntry: consumed }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          rosterEntry: reversed,
          movementId: reversalMovementId,
          consumedAt: startsAt,
          reversedAt: endsAt,
          errorCode: null,
          errorMessage: null,
        }),
      );
    const api = createLessonSessionsApi(createApiClient({ fetch }));

    await api.consume(institutionId, sessionId, rosterEntryId, {
      operationId,
      expectedRevision: 2,
      units: 1,
    });
    const bulk = await api.consumeMany(institutionId, sessionId, {
      operationId,
      items: [
        { rosterEntryId, expectedRevision: 2, units: 1 },
        { rosterEntryId: secondRosterEntryId, expectedRevision: 1, units: 2, reason: '补扣' },
      ],
    });
    const reversal = await api.reverseConsumption(institutionId, sessionId, rosterEntryId, {
      operationId: reversalOperationId,
      expectedRevision: 3,
      reason: '误操作',
    });

    const base = `/api/institutions/${institutionId}/lesson-sessions/${sessionId}`;
    expect(bulk.operationId).toBe(operationId);
    expect(reversal.rosterEntry.consumptionStatus).toBe('reversed');
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `${base}/roster/${rosterEntryId}/consumption`,
      `${base}/consumptions`,
      `${base}/roster/${rosterEntryId}/consumption/reversal`,
    ]);
    expect(requestBody(fetch, 0)).toEqual({
      operationId,
      expectedRevision: 2,
      units: 1,
      reason: null,
    });
    expect(requestBody(fetch, 1)).toEqual({
      operationId,
      items: [
        { rosterEntryId, expectedRevision: 2, units: 1, reason: null },
        { rosterEntryId: secondRosterEntryId, expectedRevision: 1, units: 2, reason: '补扣' },
      ],
    });
  });

  it('covers teacher assignment and the mobile workbench projection', async () => {
    const teacherId = actorId;
    const assignment = {
      lessonSessionId: sessionId,
      institutionId,
      teacherId,
      teacherNameSnapshot: '王老师',
      role: 'instructor',
      assignedBy: actorId,
      createdAt: startsAt,
      updatedAt: startsAt,
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({
          items: [
            {
              session,
              teachers: [assignment],
              attendance: { total: 2, pending: 1, present: 1, late: 0, leave: 0, absent: 0 },
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      )
      .mockResolvedValueOnce(response({ session, items: [assignment] }))
      .mockResolvedValueOnce(
        response({ session: { ...session, revision: 2 }, items: [assignment] }),
      );
    const api = createLessonSessionsApi(createApiClient({ fetch }));

    const workbench = await api.workbench(institutionId);
    const teachers = await api.listTeachers(institutionId, sessionId);
    await api.replaceTeachers(institutionId, sessionId, {
      expectedRevision: 1,
      assignments: [{ teacherId, role: 'instructor' }],
    });

    expect(workbench.items[0]?.attendance.pending).toBe(1);
    expect(teachers.items[0]?.teacherNameSnapshot).toBe('王老师');
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `/api/institutions/${institutionId}/lesson-session-workbench?page=1&pageSize=20`,
      `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/teachers`,
      `/api/institutions/${institutionId}/lesson-sessions/${sessionId}/teachers`,
    ]);
    expect(fetch.mock.calls[2]?.[1]?.method).toBe('PUT');
    expect(requestBody(fetch, 2)).toEqual({
      expectedRevision: 1,
      assignments: [{ teacherId, role: 'instructor' }],
    });
  });

  it('rejects invalid ids and requests before fetch and rejects invalid responses', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ ...session, status: 'unknown' }));
    const api = createLessonSessionsApi(createApiClient({ fetch }));

    expect(() => api.get('not-an-id', sessionId)).toThrow();
    expect(() =>
      api.create(institutionId, {
        institutionId,
        name: session.name,
        startsAt: endsAt,
        endsAt: startsAt,
        defaultUnits: 1,
      }),
    ).toThrow();
    expect(() =>
      api.recordAttendances(institutionId, sessionId, {
        items: [
          { rosterEntryId, expectedRevision: 1, attendanceStatus: 'present' },
          { rosterEntryId, expectedRevision: 1, attendanceStatus: 'absent' },
        ],
      }),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();

    await expect(api.get(institutionId, sessionId)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
