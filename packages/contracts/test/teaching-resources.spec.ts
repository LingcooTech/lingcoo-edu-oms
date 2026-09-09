import { describe, expect, it } from 'vitest';

import {
  campusSchema,
  classGroupSchema,
  classMembershipListQuerySchema,
  classMembershipSchema,
  createCampusRequestSchema,
  createScheduleRequestSchema,
  generateScheduleRequestSchema,
  replaceClassMembershipsRequestSchema,
  scheduleSchema,
  sessionResourceContextSchema,
  updateSessionResourceContextRequestSchema,
} from '../src/index.js';

const campusId = '11111111-1111-4111-8111-111111111111';
const institutionId = '22222222-2222-4222-8222-222222222222';
const courseId = '33333333-3333-4333-8333-333333333333';
const classGroupId = '44444444-4444-4444-8444-444444444444';
const sessionId = '55555555-5555-4555-8555-555555555555';
const now = '2026-09-08T10:00:00+08:00';

describe('P6 teaching resource contracts', () => {
  it('keeps campuses organization-scoped and applies safe create defaults', () => {
    expect(
      createCampusRequestSchema.parse({ name: '成长空间', latitude: 31.23, longitude: 121.47 }),
    ).toEqual({
      name: '成长空间',
      code: null,
      address: null,
      latitude: 31.23,
      longitude: 121.47,
      environmentImageUrls: [],
      status: 'active',
      notes: null,
    });
    expect(createCampusRequestSchema.safeParse({ name: '错误', institutionId }).success).toBe(
      false,
    );
    expect(
      campusSchema.safeParse({
        id: campusId,
        name: '空间',
        environmentImageUrls: [],
        status: 'active',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true);
  });

  it('allows resources to be associated without making course/class relations mandatory', () => {
    expect(classMembershipListQuerySchema.parse({ pageSize: 500 }).pageSize).toBe(500);
    expect(classMembershipListQuerySchema.safeParse({ pageSize: 501 }).success).toBe(false);
    expect(
      classGroupSchema.parse({
        id: classGroupId,
        institutionId,
        name: '周末班',
        capacity: 12,
        status: 'recruiting',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toHaveProperty('courseId');
    expect(
      classMembershipSchema.parse({
        classGroupId,
        institutionId,
        studentId: courseId,
        studentNameSnapshot: '林同学',
        status: 'active',
        joinedAt: now,
        leftAt: null,
        createdAt: now,
        updatedAt: now,
      }).studentNameSnapshot,
    ).toBe('林同学');
    expect(
      replaceClassMembershipsRequestSchema.safeParse({
        expectedRevision: 1,
        studentIds: [courseId, courseId],
      }).success,
    ).toBe(false);
  });

  it('validates schedule dates, weekdays, time, IANA timezone and independent defaults', () => {
    const schedule = createScheduleRequestSchema.parse({
      name: '秋季周末计划',
      sessionName: '周末成长课',
      timeZone: 'Asia/Shanghai',
      startDate: '2026-09-12',
      endDate: '2026-12-31',
      weekdays: [6, 7],
      startTime: '09:30',
      durationMinutes: 90,
      defaultUnits: 1,
    });
    expect(schedule).toMatchObject({ status: 'active' });
    expect(schedule).not.toHaveProperty('courseId');
    expect(
      createScheduleRequestSchema.safeParse({
        ...schedule,
        timeZone: 'not/a-timezone',
      }).success,
    ).toBe(false);
    expect(createScheduleRequestSchema.safeParse({ ...schedule, startTime: '9:30' }).success).toBe(
      false,
    );
    expect(createScheduleRequestSchema.safeParse({ ...schedule, weekdays: [6, 6] }).success).toBe(
      false,
    );
    expect(
      scheduleSchema.safeParse({
        id: sessionId,
        institutionId,
        ...schedule,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true);
  });

  it('does not copy class students unless explicitly requested and requires a reason for conflicts', () => {
    const base = {
      expectedRevision: 1,
      fromDate: '2026-09-12',
      toDate: '2026-09-30',
    };
    expect(generateScheduleRequestSchema.parse(base)).toMatchObject({
      includeClassStudents: false,
      allowConflicts: false,
      conflictReason: null,
    });
    expect(
      generateScheduleRequestSchema.parse({ ...base, includeClassStudents: true })
        .includeClassStudents,
    ).toBe(true);
    expect(generateScheduleRequestSchema.safeParse({ ...base, allowConflicts: true }).success).toBe(
      false,
    );
    expect(
      generateScheduleRequestSchema.parse({
        ...base,
        allowConflicts: true,
        conflictReason: '运营确认允许重叠',
      }),
    ).toMatchObject({ allowConflicts: true, conflictReason: '运营确认允许重叠' });
    expect(
      generateScheduleRequestSchema.safeParse({ ...base, fromDate: '2026-10-01' }).success,
    ).toBe(false);
  });

  it('keeps generated session resource context independently addressable', () => {
    expect(
      sessionResourceContextSchema.parse({
        sessionId,
        institutionId,
        scheduleId: null,
        scheduleName: null,
        courseId: null,
        courseName: null,
        classGroupId: null,
        classGroupName: null,
        campusId,
        campusName: '成长空间',
        classroomId: null,
        classroomName: null,
      }),
    ).toMatchObject({ sessionId, scheduleId: null, campusId });
    expect(
      updateSessionResourceContextRequestSchema.safeParse({ expectedRevision: 1 }).success,
    ).toBe(false);
    expect(
      updateSessionResourceContextRequestSchema.parse({
        expectedRevision: 1,
        campusId,
        classroomId: null,
      }),
    ).toMatchObject({ campusId, classroomId: null });
  });
});
