import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lte,
  lt,
  gt,
  sql,
  type SQL,
} from 'drizzle-orm';
import type {
  CreateLessonSessionRequest,
  LessonSessionListQuery,
  LessonSessionStatus,
  LessonSessionTeacherRole,
  UpdateLessonSessionRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  teachingSessionAttendances,
  teachingSessions,
  teachingSessionTeachers,
} from './lesson-sessions.schema.js';

export type LessonSessionRecord = typeof teachingSessions.$inferSelect;
export type LessonSessionAttendanceRecord = typeof teachingSessionAttendances.$inferSelect;
export type LessonSessionTeacherRecord = typeof teachingSessionTeachers.$inferSelect;

export class LessonSessionsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async list(institutionId: string, input: LessonSessionListQuery, teacherId?: string) {
    const filters: SQL[] = [eq(teachingSessions.institutionId, institutionId)];
    if (teacherId) {
      filters.push(
        exists(
          this.database.db
            .select({ value: sql`1` })
            .from(teachingSessionTeachers)
            .where(
              and(
                eq(teachingSessionTeachers.sessionId, teachingSessions.id),
                eq(teachingSessionTeachers.teacherId, teacherId),
              ),
            ),
        ),
      );
    }
    if (input.search) filters.push(ilike(teachingSessions.name, `%${input.search}%`));
    if (input.status) filters.push(eq(teachingSessions.status, input.status));
    if (input.source) filters.push(eq(teachingSessions.source, input.source));
    if (input.from) filters.push(gte(teachingSessions.startsAt, new Date(input.from)));
    if (input.to) filters.push(lte(teachingSessions.startsAt, new Date(input.to)));
    const where = and(...filters);
    const [items, total] = await Promise.all([
      this.database.db
        .select()
        .from(teachingSessions)
        .where(where)
        .orderBy(desc(teachingSessions.startsAt), desc(teachingSessions.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(teachingSessions).where(where),
    ]);
    return { items, total: total[0]?.value ?? 0 };
  }

  async find(
    institutionId: string,
    sessionId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(teachingSessions)
      .where(
        and(eq(teachingSessions.id, sessionId), eq(teachingSessions.institutionId, institutionId)),
      )
      .limit(1);
    return record ?? null;
  }

  async findForUpdate(institutionId: string, sessionId: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(teachingSessions)
      .where(
        and(eq(teachingSessions.id, sessionId), eq(teachingSessions.institutionId, institutionId)),
      )
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async create(input: CreateLessonSessionRequest, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(teachingSessions)
      .values({
        institutionId: input.institutionId,
        name: input.name,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        source: input.source ?? 'manual',
        defaultUnits: input.defaultUnits,
        notes: input.notes ?? null,
      })
      .returning();
    return record!;
  }

  async listSchedulingOverlaps(
    _institutionId: string,
    startsBefore: Date,
    endsAfter: Date,
    executor: DatabaseExecutor,
  ) {
    const sessions = await executor
      .select()
      .from(teachingSessions)
      .where(
        and(
          inArray(teachingSessions.status, ['draft', 'open']),
          lt(teachingSessions.startsAt, startsBefore),
          gt(teachingSessions.endsAt, endsAfter),
        ),
      )
      .orderBy(asc(teachingSessions.startsAt), asc(teachingSessions.id));
    if (sessions.length === 0) return { sessions, teachers: [] };
    const teachers = await executor
      .select()
      .from(teachingSessionTeachers)
      .where(
        inArray(
          teachingSessionTeachers.sessionId,
          sessions.map((session) => session.id),
        ),
      );
    return { sessions, teachers };
  }

  async createFromSchedule(
    input: {
      institutionId: string;
      name: string;
      startsAt: Date;
      endsAt: Date;
      defaultUnits: number;
      notes: string | null;
      students: Array<{ studentId: string; studentNameSnapshot: string }>;
      teachers: Array<{
        teacherId: string;
        teacherNameSnapshot: string;
        role: LessonSessionTeacherRole;
      }>;
      assignedBy: string;
    },
    executor: DatabaseTransaction,
  ) {
    const [session] = await executor
      .insert(teachingSessions)
      .values({
        institutionId: input.institutionId,
        name: input.name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        source: 'schedule',
        status: 'draft',
        defaultUnits: input.defaultUnits,
        notes: input.notes,
      })
      .returning();
    if (!session) throw new Error('Scheduled lesson session insert returned no row');
    if (input.students.length > 0) {
      await executor.insert(teachingSessionAttendances).values(
        input.students.map((student) => ({
          sessionId: session.id,
          institutionId: session.institutionId,
          studentId: student.studentId,
          studentNameSnapshot: student.studentNameSnapshot,
          plannedUnits: session.defaultUnits,
        })),
      );
    }
    if (input.teachers.length > 0) {
      await executor.insert(teachingSessionTeachers).values(
        input.teachers.map((teacher) => ({
          sessionId: session.id,
          institutionId: session.institutionId,
          teacherId: teacher.teacherId,
          teacherNameSnapshot: teacher.teacherNameSnapshot,
          role: teacher.role,
          assignedBy: input.assignedBy,
        })),
      );
    }
    return session;
  }

  async advanceResourceRevision(
    institutionId: string,
    sessionId: string,
    expectedRevision: number,
    executor: DatabaseTransaction,
  ) {
    const [row] = await executor
      .update(teachingSessions)
      .set({ revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(teachingSessions.id, sessionId),
          eq(teachingSessions.institutionId, institutionId),
          eq(teachingSessions.revision, expectedRevision),
          inArray(teachingSessions.status, ['draft', 'open']),
        ),
      )
      .returning();
    return row ?? null;
  }

  async update(
    session: LessonSessionRecord,
    input: UpdateLessonSessionRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(teachingSessions)
      .set({
        ...changes,
        startsAt: changes.startsAt ? new Date(changes.startsAt) : undefined,
        endsAt: changes.endsAt ? new Date(changes.endsAt) : undefined,
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(eq(teachingSessions.id, session.id), eq(teachingSessions.revision, expectedRevision)),
      )
      .returning();
    return record ?? null;
  }

  async transition(
    session: LessonSessionRecord,
    status: LessonSessionStatus,
    executor: DatabaseTransaction,
    reason?: string | null,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(teachingSessions)
      .set({
        status,
        openedAt: status === 'open' ? now : session.openedAt,
        completedAt: status === 'completed' ? now : session.completedAt,
        cancelledAt: status === 'cancelled' ? now : session.cancelledAt,
        cancellationReason: status === 'cancelled' ? (reason ?? null) : session.cancellationReason,
        revision: session.revision + 1,
        updatedAt: now,
      })
      .where(
        and(eq(teachingSessions.id, session.id), eq(teachingSessions.revision, session.revision)),
      )
      .returning();
    return record ?? null;
  }

  async addRosterEntries(
    session: LessonSessionRecord,
    students: Array<{ studentId: string; studentNameSnapshot: string }>,
    executor: DatabaseTransaction,
  ) {
    const rows = await executor
      .insert(teachingSessionAttendances)
      .values(
        students.map((student) => ({
          sessionId: session.id,
          institutionId: session.institutionId,
          studentId: student.studentId,
          studentNameSnapshot: student.studentNameSnapshot,
          plannedUnits: session.defaultUnits,
        })),
      )
      .returning();
    const [updatedSession] = await executor
      .update(teachingSessions)
      .set({ revision: session.revision + 1, updatedAt: new Date() })
      .where(
        and(eq(teachingSessions.id, session.id), eq(teachingSessions.revision, session.revision)),
      )
      .returning();
    return { rows, session: updatedSession ?? null };
  }

  async listRoster(sessionId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(teachingSessionAttendances)
      .where(eq(teachingSessionAttendances.sessionId, sessionId))
      .orderBy(asc(teachingSessionAttendances.createdAt), asc(teachingSessionAttendances.id));
  }

  async isTeacherAssigned(
    sessionId: string,
    teacherId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select({ teacherId: teachingSessionTeachers.teacherId })
      .from(teachingSessionTeachers)
      .where(
        and(
          eq(teachingSessionTeachers.sessionId, sessionId),
          eq(teachingSessionTeachers.teacherId, teacherId),
        ),
      )
      .limit(1);
    return Boolean(record);
  }

  async listTeacherAssignments(sessionId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(teachingSessionTeachers)
      .where(eq(teachingSessionTeachers.sessionId, sessionId))
      .orderBy(asc(teachingSessionTeachers.role), asc(teachingSessionTeachers.createdAt));
  }

  async replaceTeacherAssignments(
    session: LessonSessionRecord,
    assignments: Array<{
      teacherId: string;
      teacherNameSnapshot: string;
      role: LessonSessionTeacherRole;
    }>,
    assignedBy: string,
    executor: DatabaseTransaction,
  ) {
    await executor
      .delete(teachingSessionTeachers)
      .where(eq(teachingSessionTeachers.sessionId, session.id));
    const rows = assignments.length
      ? await executor
          .insert(teachingSessionTeachers)
          .values(
            assignments.map((assignment) => ({
              sessionId: session.id,
              institutionId: session.institutionId,
              teacherId: assignment.teacherId,
              teacherNameSnapshot: assignment.teacherNameSnapshot,
              role: assignment.role,
              assignedBy,
            })),
          )
          .returning()
      : [];
    const [updatedSession] = await executor
      .update(teachingSessions)
      .set({ revision: session.revision + 1, updatedAt: new Date() })
      .where(
        and(eq(teachingSessions.id, session.id), eq(teachingSessions.revision, session.revision)),
      )
      .returning();
    return { rows, session: updatedSession ?? null };
  }

  async workbenchEvidence(sessionIds: string[], executor: DatabaseExecutor = this.database.db) {
    if (sessionIds.length === 0) return { teachers: [], attendance: [] };
    const [teachers, attendance] = await Promise.all([
      executor
        .select()
        .from(teachingSessionTeachers)
        .where(inArray(teachingSessionTeachers.sessionId, sessionIds))
        .orderBy(asc(teachingSessionTeachers.role), asc(teachingSessionTeachers.createdAt)),
      executor
        .select({
          sessionId: teachingSessionAttendances.sessionId,
          total: count(),
          pending: sql<number>`count(*) filter (where ${teachingSessionAttendances.attendanceStatus} = 'pending')::int`,
          present: sql<number>`count(*) filter (where ${teachingSessionAttendances.attendanceStatus} = 'present')::int`,
          late: sql<number>`count(*) filter (where ${teachingSessionAttendances.attendanceStatus} = 'late')::int`,
          leave: sql<number>`count(*) filter (where ${teachingSessionAttendances.attendanceStatus} = 'leave')::int`,
          absent: sql<number>`count(*) filter (where ${teachingSessionAttendances.attendanceStatus} = 'absent')::int`,
        })
        .from(teachingSessionAttendances)
        .where(inArray(teachingSessionAttendances.sessionId, sessionIds))
        .groupBy(teachingSessionAttendances.sessionId),
    ]);
    return { teachers, attendance };
  }

  async findRosterForUpdate(
    sessionId: string,
    rosterEntryId: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .select()
      .from(teachingSessionAttendances)
      .where(
        and(
          eq(teachingSessionAttendances.id, rosterEntryId),
          eq(teachingSessionAttendances.sessionId, sessionId),
        ),
      )
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async recordAttendance(
    record: LessonSessionAttendanceRecord,
    attendanceStatus: LessonSessionAttendanceRecord['attendanceStatus'],
    actorId: string,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [updated] = await executor
      .update(teachingSessionAttendances)
      .set({
        attendanceStatus,
        attendanceRecordedAt: attendanceStatus === 'pending' ? null : now,
        attendanceRecordedBy: attendanceStatus === 'pending' ? null : actorId,
        revision: record.revision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(teachingSessionAttendances.id, record.id),
          eq(teachingSessionAttendances.revision, record.revision),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async markConsumed(
    record: LessonSessionAttendanceRecord,
    input: { units: number; movementId: string; operationId: string },
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [updated] = await executor
      .update(teachingSessionAttendances)
      .set({
        consumptionStatus: 'consumed',
        consumedUnits: input.units,
        consumptionMovementId: input.movementId,
        consumptionOperationId: input.operationId,
        reversalMovementId: null,
        reversalOperationId: null,
        consumedAt: now,
        reversedAt: null,
        consumptionErrorCode: null,
        consumptionErrorMessage: null,
        revision: record.revision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(teachingSessionAttendances.id, record.id),
          eq(teachingSessionAttendances.revision, record.revision),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async markConsumptionFailed(
    record: LessonSessionAttendanceRecord,
    input: { operationId: string; errorCode: string; errorMessage: string },
    executor: DatabaseTransaction,
  ) {
    const [updated] = await executor
      .update(teachingSessionAttendances)
      .set({
        consumptionStatus: 'failed',
        consumedUnits: 0,
        consumptionMovementId: null,
        reversalMovementId: null,
        reversalOperationId: null,
        consumedAt: null,
        reversedAt: null,
        consumptionOperationId: input.operationId,
        consumptionErrorCode: input.errorCode,
        consumptionErrorMessage: input.errorMessage,
        revision: record.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(teachingSessionAttendances.id, record.id),
          eq(teachingSessionAttendances.revision, record.revision),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async markReversed(
    record: LessonSessionAttendanceRecord,
    input: { reversalMovementId: string; operationId: string },
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [updated] = await executor
      .update(teachingSessionAttendances)
      .set({
        consumptionStatus: 'reversed',
        reversalMovementId: input.reversalMovementId,
        reversalOperationId: input.operationId,
        reversedAt: now,
        revision: record.revision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(teachingSessionAttendances.id, record.id),
          eq(teachingSessionAttendances.revision, record.revision),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async countPendingAttendance(sessionId: string, executor: DatabaseExecutor) {
    const [result] = await executor
      .select({ value: count() })
      .from(teachingSessionAttendances)
      .where(
        and(
          eq(teachingSessionAttendances.sessionId, sessionId),
          eq(teachingSessionAttendances.attendanceStatus, 'pending'),
        ),
      );
    return result?.value ?? 0;
  }

  async countActiveConsumptions(sessionId: string, executor: DatabaseExecutor) {
    const [result] = await executor
      .select({ value: count() })
      .from(teachingSessionAttendances)
      .where(
        and(
          eq(teachingSessionAttendances.sessionId, sessionId),
          eq(teachingSessionAttendances.consumptionStatus, 'consumed'),
        ),
      );
    return result?.value ?? 0;
  }

  isRosterDuplicate(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
      const candidate = current as { code?: string; constraint?: string; cause?: unknown };
      if (
        candidate.code === '23505' &&
        candidate.constraint === 'teaching_session_attendances_session_student_unique'
      ) {
        return true;
      }
      current = candidate.cause;
    }
    return false;
  }
}
