import { describe, expect, it } from 'vitest';

import {
  addLessonSessionStudentRequestSchema,
  addLessonSessionStudentsRequestSchema,
  cancelLessonSessionRequestSchema,
  completeLessonSessionRequestSchema,
  consumeLessonSessionStudentRequestSchema,
  consumeLessonSessionStudentsRequestSchema,
  createLessonSessionRequestSchema,
  lessonSessionBulkConsumptionResultSchema,
  lessonSessionListQuerySchema,
  lessonSessionRosterEntrySchema,
  lessonSessionSchema,
  openLessonSessionRequestSchema,
  recordLessonSessionAttendanceRequestSchema,
  recordLessonSessionAttendancesRequestSchema,
  replaceLessonSessionTeachersRequestSchema,
  reverseLessonSessionConsumptionRequestSchema,
  updateLessonSessionRequestSchema,
} from '../src/index.js';

const institutionId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const secondStudentId = '44444444-4444-4444-8444-444444444444';
const rosterEntryId = '55555555-5555-4555-8555-555555555555';
const secondRosterEntryId = '66666666-6666-4666-8666-666666666666';
const actorId = '77777777-7777-4777-8777-777777777777';
const teacherId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const movementId = '88888888-8888-4888-8888-888888888888';
const operationId = '99999999-9999-4999-8999-999999999999';
const now = '2026-09-07T09:00:00+08:00';
const later = '2026-09-07T10:00:00+08:00';

describe('P4 lesson session contracts', () => {
  it('models an institution-owned session without making teaching resources dependencies', () => {
    const parsed = createLessonSessionRequestSchema.parse({
      institutionId,
      name: '周日下午成长课',
      startsAt: now,
      endsAt: later,
      defaultUnits: 1,
      courseId: sessionId,
      teacherId: actorId,
      classroomId: rosterEntryId,
    });

    expect(parsed).toEqual({
      institutionId,
      name: '周日下午成长课',
      startsAt: now,
      endsAt: later,
      source: 'manual',
      defaultUnits: 1,
      notes: null,
    });
    expect(
      createLessonSessionRequestSchema.safeParse({
        institutionId,
        name: '错误时间',
        startsAt: later,
        endsAt: now,
        defaultUnits: 1,
      }).success,
    ).toBe(false);
    expect(
      createLessonSessionRequestSchema.safeParse({
        institutionId,
        name: '半课时',
        startsAt: now,
        endsAt: later,
        defaultUnits: 0.5,
      }).success,
    ).toBe(false);
  });

  it('accepts only the explicit session lifecycle and source values', () => {
    expect(
      lessonSessionSchema.parse({
        id: sessionId,
        institutionId,
        name: '临时一对一',
        startsAt: now,
        endsAt: later,
        status: 'open',
        source: 'ad_hoc',
        defaultUnits: 2,
        notes: null,
        cancellationReason: null,
        openedAt: now,
        completedAt: null,
        cancelledAt: null,
        revision: 2,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ status: 'open', source: 'ad_hoc' });
    expect(
      lessonSessionSchema.safeParse({
        id: sessionId,
        institutionId,
        name: '非法状态',
        startsAt: now,
        endsAt: later,
        status: 'in_progress',
        source: 'imported',
        defaultUnits: 1,
        notes: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(false);
  });

  it('uses shared pagination and validates session time filters', () => {
    expect(
      lessonSessionListQuerySchema.parse({ page: '2', pageSize: '50', institutionId }),
    ).toMatchObject({ page: 2, pageSize: 50, institutionId });
    expect(lessonSessionListQuerySchema.safeParse({ from: later, to: now }).success).toBe(false);
  });

  it('requires optimistic revisions for updates and lifecycle transitions', () => {
    expect(updateLessonSessionRequestSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
    expect(
      updateLessonSessionRequestSchema.parse({
        expectedRevision: 3,
        name: '更新后的课次',
        source: 'schedule',
      }),
    ).toMatchObject({ expectedRevision: 3, source: 'schedule' });
    expect(completeLessonSessionRequestSchema.safeParse({}).success).toBe(false);
    expect(openLessonSessionRequestSchema.parse({ expectedRevision: 1 })).toEqual({
      expectedRevision: 1,
    });
    expect(cancelLessonSessionRequestSchema.parse({ expectedRevision: 2 })).toEqual({
      expectedRevision: 2,
      reason: null,
    });
  });

  it('adds one or many unique students against the expected session revision', () => {
    expect(addLessonSessionStudentRequestSchema.parse({ expectedRevision: 2, studentId })).toEqual({
      expectedRevision: 2,
      studentId,
    });
    expect(
      addLessonSessionStudentsRequestSchema.parse({
        expectedRevision: 2,
        studentIds: [studentId, secondStudentId],
      }).studentIds,
    ).toHaveLength(2);
    expect(
      addLessonSessionStudentsRequestSchema.safeParse({
        expectedRevision: 2,
        studentIds: [studentId, studentId],
      }).success,
    ).toBe(false);
  });

  it('keeps teacher assignment optional, multi-valued and explicitly versioned', () => {
    expect(
      replaceLessonSessionTeachersRequestSchema.parse({
        expectedRevision: 2,
        assignments: [{ teacherId }],
      }),
    ).toEqual({
      expectedRevision: 2,
      assignments: [{ teacherId, role: 'instructor' }],
    });
    expect(
      replaceLessonSessionTeachersRequestSchema.parse({
        expectedRevision: 2,
        assignments: [],
      }).assignments,
    ).toEqual([]);
    expect(
      replaceLessonSessionTeachersRequestSchema.safeParse({
        expectedRevision: 2,
        assignments: [
          { teacherId, role: 'instructor' },
          { teacherId, role: 'assistant' },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps attendance independent from consumption and versions each roster edit', () => {
    const roster = lessonSessionRosterEntrySchema.parse({
      id: rosterEntryId,
      lessonSessionId: sessionId,
      institutionId,
      studentId,
      studentNameSnapshot: '林同学',
      attendanceStatus: 'present',
      attendanceRecordedAt: now,
      attendanceRecordedBy: actorId,
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
      revision: 2,
      createdAt: now,
      updatedAt: now,
    });
    expect(roster).toMatchObject({
      attendanceStatus: 'present',
      consumptionStatus: 'not_consumed',
    });
    expect(
      recordLessonSessionAttendanceRequestSchema.parse({
        expectedRevision: 2,
        attendanceStatus: 'late',
      }),
    ).toEqual({ expectedRevision: 2, attendanceStatus: 'late' });
    expect(
      recordLessonSessionAttendanceRequestSchema.parse({
        expectedRevision: 3,
        attendanceStatus: 'pending',
      }),
    ).toEqual({ expectedRevision: 3, attendanceStatus: 'pending' });
    expect(
      recordLessonSessionAttendancesRequestSchema.safeParse({
        items: [
          { rosterEntryId, expectedRevision: 1, attendanceStatus: 'present' },
          { rosterEntryId, expectedRevision: 1, attendanceStatus: 'absent' },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires UUID operation ids, positive units and per-entry revisions for consumption', () => {
    expect(
      consumeLessonSessionStudentRequestSchema.parse({
        operationId,
        expectedRevision: 2,
        units: 1,
      }),
    ).toEqual({ operationId, expectedRevision: 2, units: 1, reason: null });
    expect(
      consumeLessonSessionStudentRequestSchema.safeParse({
        operationId: 'consume-001',
        expectedRevision: 2,
        units: 1,
      }).success,
    ).toBe(false);
    expect(
      consumeLessonSessionStudentsRequestSchema.safeParse({
        operationId,
        items: [{ rosterEntryId, expectedRevision: 1, units: 0 }],
      }).success,
    ).toBe(false);
    expect(
      consumeLessonSessionStudentsRequestSchema.parse({
        operationId,
        items: [
          { rosterEntryId, expectedRevision: 1, units: 1 },
          {
            rosterEntryId: secondRosterEntryId,
            expectedRevision: 4,
            units: 2,
            reason: '单独约定两课时',
          },
        ],
      }).items,
    ).toHaveLength(2);
  });

  it('requires a reason and new operation id to reverse a consumed roster entry', () => {
    expect(
      reverseLessonSessionConsumptionRequestSchema.parse({
        operationId,
        expectedRevision: 3,
        reason: '签到对象选择错误',
      }),
    ).toEqual({ operationId, expectedRevision: 3, reason: '签到对象选择错误' });
    expect(
      reverseLessonSessionConsumptionRequestSchema.safeParse({
        operationId,
        expectedRevision: 3,
        reason: '   ',
      }).success,
    ).toBe(false);
  });

  it('returns movement, reversal, timestamps and failure details for traceability', () => {
    const result = lessonSessionBulkConsumptionResultSchema.parse({
      operationId,
      items: [
        {
          rosterEntry: {
            id: rosterEntryId,
            lessonSessionId: sessionId,
            institutionId,
            studentId,
            studentNameSnapshot: '林同学',
            attendanceStatus: 'present',
            attendanceRecordedAt: now,
            attendanceRecordedBy: actorId,
            consumptionStatus: 'consumed',
            plannedUnits: 1,
            consumedUnits: 1,
            movementId,
            reversalMovementId: null,
            consumptionOperationId: operationId,
            reversalOperationId: null,
            consumedAt: later,
            reversedAt: null,
            consumptionErrorCode: null,
            consumptionErrorMessage: null,
            revision: 3,
            createdAt: now,
            updatedAt: later,
          },
          movementId,
          consumedAt: later,
          reversedAt: null,
          errorCode: null,
          errorMessage: null,
        },
        {
          rosterEntry: {
            id: secondRosterEntryId,
            lessonSessionId: sessionId,
            institutionId,
            studentId: secondStudentId,
            studentNameSnapshot: '周同学',
            attendanceStatus: 'present',
            attendanceRecordedAt: now,
            attendanceRecordedBy: actorId,
            consumptionStatus: 'failed',
            plannedUnits: 2,
            consumedUnits: null,
            movementId: null,
            reversalMovementId: null,
            consumptionOperationId: operationId,
            reversalOperationId: null,
            consumedAt: null,
            reversedAt: null,
            consumptionErrorCode: 'INSUFFICIENT_BALANCE',
            consumptionErrorMessage: '课时余额不足',
            revision: 2,
            createdAt: now,
            updatedAt: later,
          },
          movementId: null,
          consumedAt: null,
          reversedAt: null,
          errorCode: 'INSUFFICIENT_BALANCE',
          errorMessage: '课时余额不足',
        },
      ],
    });

    expect(result.items[0]?.movementId).toBe(movementId);
    expect(result.items[1]).toMatchObject({
      movementId: null,
      errorCode: 'INSUFFICIENT_BALANCE',
      errorMessage: '课时余额不足',
    });
  });
});
