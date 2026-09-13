import { ApiError } from '@lingcoo-tech/http';
import {
  lessonSessionConsumptionResultSchema,
  type AddLessonSessionStudentsRequest,
  type CancelLessonSessionRequest,
  type CompleteLessonSessionRequest,
  type ConsumeLessonSessionStudentRequest,
  type ConsumeLessonSessionStudentsRequest,
  type CreateLessonSessionRequest,
  type EducationDataScope,
  type LessonSession,
  type LessonSessionAttendanceStatus,
  type LessonSessionConsumptionResult,
  type LessonSessionListQuery,
  type LessonSessionRosterEntry,
  type LessonSessionTeacherAssignment,
  type Student360Delivery,
  type ReplaceLessonSessionTeachersRequest,
  type OpenLessonSessionRequest,
  type RecordLessonSessionAttendanceRequest,
  type RecordLessonSessionAttendancesRequest,
  type ReverseLessonSessionConsumptionRequest,
  type UpdateLessonSessionRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import { acquireSchedulingConflictLock } from '../../../database/scheduling-lock.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type {
  LessonConsumptionLedger,
  LessonMutationContext,
} from '../../lesson-accounts/public.js';
import type { IdempotencyService } from '../../idempotency/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { StudentDirectory, TeacherDirectory } from '../../people/public.js';
import type { PeriodCardConsumptionPort } from '../../period-cards/public.js';
import { canConsumeAttendance } from '../domain/model.js';
import {
  LessonSessionsRepository,
  type LessonSessionAttendanceRecord,
  type LessonSessionRecord,
  type LessonSessionTeacherRecord,
} from '../infrastructure/persistence/lesson-sessions.repository.js';

export interface LessonSessionActor extends AuditContext {
  actorId: string;
}

export interface SchedulingSessionInput {
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
    role: 'instructor' | 'assistant';
  }>;
  assignedBy: string;
}

export interface SchedulingOverlap {
  sessionId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  teacherIds: string[];
}

export interface LessonSessionSchedulingPort {
  getSchedulingSession(
    institutionId: string,
    sessionId: string,
    executor?: import('../../../database/database.js').DatabaseExecutor,
  ): Promise<{
    id: string;
    institutionId: string;
    name: string;
    startsAt: Date;
    endsAt: Date;
    revision: number;
    status: string;
  } | null>;
  listSchedulingOverlaps(
    institutionId: string,
    startsBefore: Date,
    endsAfter: Date,
    executor: DatabaseTransaction,
  ): Promise<SchedulingOverlap[]>;
  createScheduledSession(
    input: SchedulingSessionInput,
    executor: DatabaseTransaction,
  ): Promise<{ id: string; institutionId: string; name: string; startsAt: Date; endsAt: Date }>;
  advanceResourceRevision(
    institutionId: string,
    sessionId: string,
    expectedRevision: number,
    executor: DatabaseTransaction,
  ): Promise<void>;
}

export interface LessonSessionResourceConflictPolicy {
  assertResourceTimeAvailable(
    institutionId: string,
    sessionId: string,
    startsAt: Date,
    endsAt: Date,
    executor: DatabaseTransaction,
  ): Promise<void>;
}

export class LessonSessionsService implements LessonSessionSchedulingPort {
  private resourceConflictPolicy?: LessonSessionResourceConflictPolicy;

  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: LessonSessionsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly students: StudentDirectory,
    private readonly teachers: TeacherDirectory,
    private readonly lessonAccounts: LessonConsumptionLedger,
    private readonly periodCards: PeriodCardConsumptionPort,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
  ) {}

  setResourceConflictPolicy(policy: LessonSessionResourceConflictPolicy) {
    this.resourceConflictPolicy = policy;
  }

  async getSchedulingSession(
    institutionId: string,
    sessionId: string,
    executor: import('../../../database/database.js').DatabaseExecutor = this.database.db,
  ) {
    const session = await this.repository.find(institutionId, sessionId, executor);
    return session
      ? {
          id: session.id,
          institutionId: session.institutionId,
          name: session.name,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          revision: session.revision,
          status: session.status,
        }
      : null;
  }

  async listSchedulingOverlaps(
    institutionId: string,
    startsBefore: Date,
    endsAfter: Date,
    executor: DatabaseTransaction,
  ): Promise<SchedulingOverlap[]> {
    const result = await this.repository.listSchedulingOverlaps(
      institutionId,
      startsBefore,
      endsAfter,
      executor,
    );
    const teachersBySession = new Map<string, string[]>();
    for (const assignment of result.teachers) {
      const ids = teachersBySession.get(assignment.sessionId) ?? [];
      ids.push(assignment.teacherId);
      teachersBySession.set(assignment.sessionId, ids);
    }
    return result.sessions.map((session) => ({
      sessionId: session.id,
      name: session.name,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      teacherIds: teachersBySession.get(session.id) ?? [],
    }));
  }

  async createScheduledSession(input: SchedulingSessionInput, executor: DatabaseTransaction) {
    return this.repository.createFromSchedule(input, executor);
  }

  async advanceResourceRevision(
    institutionId: string,
    sessionId: string,
    expectedRevision: number,
    executor: DatabaseTransaction,
  ): Promise<void> {
    const existing = await this.repository.find(institutionId, sessionId, executor);
    if (!existing) throw this.notFound();
    if (!['draft', 'open'].includes(existing.status)) {
      throw new ApiError(409, 'LESSON_SESSION_RESOURCES_LOCKED', '已结束或已取消课次不能调整资源');
    }
    if (existing.revision !== expectedRevision) throw this.versionConflict('课次');
    const updated = await this.repository.advanceResourceRevision(
      institutionId,
      sessionId,
      expectedRevision,
      executor,
    );
    if (!updated) throw this.versionConflict('课次');
  }

  async list(institutionId: string, input: LessonSessionListQuery, scope: EducationDataScope) {
    this.assertInstitutionId(institutionId, scope);
    if (scope.kind === 'guardian') {
      throw new ApiError(403, 'LESSON_SESSION_SCOPE_DENIED', '家长不能访问完整课次列表');
    }
    if (input.institutionId && input.institutionId !== institutionId) {
      throw new ApiError(400, 'LESSON_SESSION_INSTITUTION_MISMATCH', '查询机构与路径机构不一致');
    }
    const result = await this.repository.list(
      institutionId,
      input,
      scope.kind === 'teacher' ? scope.teacherId : undefined,
    );
    return {
      items: result.items.map((record) => this.sessionView(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async get(institutionId: string, sessionId: string, scope: EducationDataScope) {
    this.assertInstitutionId(institutionId, scope);
    const record = await this.repository.find(institutionId, sessionId);
    if (!record) throw this.notFound();
    await this.assertSessionAccess(record.id, scope);
    return this.sessionView(record);
  }

  async workbench(institutionId: string, input: LessonSessionListQuery, scope: EducationDataScope) {
    this.assertInstitutionId(institutionId, scope);
    if (scope.kind === 'guardian') {
      throw new ApiError(403, 'LESSON_SESSION_SCOPE_DENIED', '家长不能访问教师工作台');
    }
    const result = await this.repository.list(
      institutionId,
      input,
      scope.kind === 'teacher' ? scope.teacherId : undefined,
    );
    const evidence = await this.repository.workbenchEvidence(result.items.map((item) => item.id));
    const teachersBySession = new Map<string, LessonSessionTeacherRecord[]>();
    for (const assignment of evidence.teachers) {
      const items = teachersBySession.get(assignment.sessionId) ?? [];
      items.push(assignment);
      teachersBySession.set(assignment.sessionId, items);
    }
    const attendanceBySession = new Map(evidence.attendance.map((item) => [item.sessionId, item]));
    return {
      items: result.items.map((record) => {
        const attendance = attendanceBySession.get(record.id);
        return {
          session: this.sessionView(record),
          teachers: (teachersBySession.get(record.id) ?? []).map((item) =>
            this.teacherAssignmentView(item),
          ),
          attendance: attendance
            ? {
                total: attendance.total,
                pending: attendance.pending,
                present: attendance.present,
                late: attendance.late,
                leave: attendance.leave,
                absent: attendance.absent,
              }
            : { total: 0, pending: 0, present: 0, late: 0, leave: 0, absent: 0 },
          consumption: attendance
            ? {
                notConsumed: attendance.notConsumed,
                consumed: attendance.consumed,
                reversed: attendance.reversed,
                failed: attendance.failed,
                consumedUnits: attendance.consumedUnits,
              }
            : { notConsumed: 0, consumed: 0, reversed: 0, failed: 0, consumedUnits: 0 },
        };
      }),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async listStudentDeliveries(
    institutionId: string,
    studentId: string,
    scope: EducationDataScope,
    limit = 50,
  ): Promise<Student360Delivery[]> {
    this.assertInstitutionId(institutionId, scope);
    await this.students.assertStudentAccess(studentId, scope, this.database.db);
    const rows = await this.repository.listStudentDeliveries(institutionId, studentId, limit);
    const evidence = await this.repository.workbenchEvidence(rows.map((row) => row.session.id));
    const teachersBySession = new Map<string, LessonSessionTeacherRecord[]>();
    for (const assignment of evidence.teachers) {
      const items = teachersBySession.get(assignment.sessionId) ?? [];
      items.push(assignment);
      teachersBySession.set(assignment.sessionId, items);
    }
    return rows.map((row) => ({
      session: this.sessionView(row.session),
      attendance: this.rosterView(row.attendance),
      teachers: (teachersBySession.get(row.session.id) ?? []).map((assignment) =>
        this.teacherAssignmentView(assignment),
      ),
    }));
  }

  async listTeachers(institutionId: string, sessionId: string, scope: EducationDataScope) {
    this.assertInstitutionId(institutionId, scope);
    const session = await this.repository.find(institutionId, sessionId);
    if (!session) throw this.notFound();
    await this.assertSessionAccess(session.id, scope);
    return {
      session: this.sessionView(session),
      items: (await this.repository.listTeacherAssignments(session.id)).map((item) =>
        this.teacherAssignmentView(item),
      ),
    };
  }

  async replaceTeachers(
    institutionId: string,
    sessionId: string,
    input: ReplaceLessonSessionTeachersRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    return this.database.transaction(async (transaction) => {
      await acquireSchedulingConflictLock(transaction);
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      if (!['draft', 'open'].includes(session.status)) {
        throw new ApiError(
          409,
          'LESSON_SESSION_TEACHERS_LOCKED',
          '已结束或已取消的课次不能调整教师',
        );
      }
      this.assertRevision(session.revision, input.expectedRevision, '课次');
      const snapshots = await Promise.all(
        input.assignments.map(async (assignment) => ({
          ...(await this.teachers.getActiveTeacherSnapshot(
            assignment.teacherId,
            institutionId,
            transaction,
          )),
          role: assignment.role,
        })),
      );
      const requestedTeacherIds = new Set(snapshots.map((teacher) => teacher.id));
      if (requestedTeacherIds.size > 0) {
        const overlaps = await this.repository.listSchedulingOverlaps(
          institutionId,
          session.endsAt,
          session.startsAt,
          transaction,
        );
        const overlapById = new Map(overlaps.sessions.map((item) => [item.id, item]));
        const conflicts = overlaps.teachers
          .filter(
            (assignment) =>
              assignment.sessionId !== session.id && requestedTeacherIds.has(assignment.teacherId),
          )
          .map((assignment) => ({
            resourceType: 'teacher' as const,
            resourceId: assignment.teacherId,
            name:
              snapshots.find((teacher) => teacher.id === assignment.teacherId)?.fullName ??
              assignment.teacherNameSnapshot,
            existingSessionId: assignment.sessionId,
            existingSessionName: overlapById.get(assignment.sessionId)?.name ?? '未命名课次',
          }));
        if (conflicts.length > 0) {
          throw new ApiError(
            409,
            'LESSON_SESSION_TEACHER_CONFLICT',
            '教师与其他进行中或待上课课次时间冲突',
            { conflicts },
          );
        }
      }
      const replaced = await this.repository.replaceTeacherAssignments(
        session,
        snapshots.map((teacher) => ({
          teacherId: teacher.id,
          teacherNameSnapshot: teacher.fullName,
          role: teacher.role,
        })),
        context.actorId,
        transaction,
      );
      if (!replaced.session) throw this.versionConflict('课次');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-session.teachers-replaced',
          resourceType: 'lesson-session',
          resourceId: session.id,
          metadata: { institutionId, assignments: input.assignments },
        },
        transaction,
      );
      return {
        session: this.sessionView(replaced.session),
        items: replaced.rows.map((item) => this.teacherAssignmentView(item)),
      };
    });
  }

  async create(
    institutionId: string,
    input: CreateLessonSessionRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ): Promise<LessonSession> {
    this.assertInstitutionWriteScope(institutionId, scope);
    if (input.institutionId !== institutionId) {
      throw new ApiError(400, 'LESSON_SESSION_INSTITUTION_MISMATCH', '课次机构与路径机构不一致');
    }
    return this.database.transaction(async (transaction) => {
      await this.institutions.assertActiveInstitution(institutionId, transaction);
      const created = await this.repository.create(input, transaction);
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-session.created',
          resourceType: 'lesson-session',
          resourceId: created.id,
          metadata: { institutionId, source: created.source, defaultUnits: created.defaultUnits },
        },
        transaction,
      );
      return this.sessionView(created);
    });
  }

  async update(
    institutionId: string,
    sessionId: string,
    input: UpdateLessonSessionRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    return this.database.transaction(async (transaction) => {
      await acquireSchedulingConflictLock(transaction);
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      if (!['draft', 'open'].includes(session.status)) {
        throw new ApiError(409, 'LESSON_SESSION_NOT_EDITABLE', '已结束或已取消的课次不能修改');
      }
      this.assertRevision(session.revision, input.expectedRevision, '课次');
      const startsAt = input.startsAt ? new Date(input.startsAt) : session.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : session.endsAt;
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new ApiError(400, 'LESSON_SESSION_TIME_INVALID', '结束时间必须晚于开始时间');
      }
      if (input.startsAt !== undefined || input.endsAt !== undefined) {
        const assignments = await this.repository.listTeacherAssignments(session.id, transaction);
        const teacherIds = new Set(assignments.map((assignment) => assignment.teacherId));
        if (teacherIds.size > 0) {
          const overlaps = await this.repository.listSchedulingOverlaps(
            institutionId,
            endsAt,
            startsAt,
            transaction,
          );
          const overlapById = new Map(overlaps.sessions.map((item) => [item.id, item]));
          const conflicts = overlaps.teachers
            .filter(
              (assignment) =>
                assignment.sessionId !== session.id && teacherIds.has(assignment.teacherId),
            )
            .map((assignment) => ({
              resourceType: 'teacher' as const,
              resourceId: assignment.teacherId,
              name:
                assignments.find((item) => item.teacherId === assignment.teacherId)
                  ?.teacherNameSnapshot ?? assignment.teacherNameSnapshot,
              existingSessionId: assignment.sessionId,
              existingSessionName: overlapById.get(assignment.sessionId)?.name ?? '未命名课次',
            }));
          if (conflicts.length > 0) {
            throw new ApiError(
              409,
              'LESSON_SESSION_TEACHER_CONFLICT',
              '调整时间后教师将与其他进行中或待上课课次冲突',
              { conflicts },
            );
          }
        }
        await this.resourceConflictPolicy?.assertResourceTimeAvailable(
          institutionId,
          session.id,
          startsAt,
          endsAt,
          transaction,
        );
      }
      const updated = await this.repository.update(session, input, transaction);
      if (!updated) throw this.versionConflict('课次');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-session.updated',
          resourceType: 'lesson-session',
          resourceId: session.id,
          changes: Object.entries(input)
            .filter(([field]) => field !== 'expectedRevision')
            .map(([field, after]) => ({
              field,
              before: session[field as keyof LessonSessionRecord] ?? null,
              after: after ?? null,
            })),
        },
        transaction,
      );
      return this.sessionView(updated);
    });
  }

  async open(
    institutionId: string,
    sessionId: string,
    input: OpenLessonSessionRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    return this.transition(
      institutionId,
      sessionId,
      input.expectedRevision,
      'draft',
      'open',
      null,
      context,
    );
  }

  async complete(
    institutionId: string,
    sessionId: string,
    input: CompleteLessonSessionRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    return this.database.transaction(async (transaction) => {
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      if (session.status !== 'open') {
        throw new ApiError(409, 'LESSON_SESSION_NOT_OPEN', '只有进行中的课次可以完成');
      }
      this.assertRevision(session.revision, input.expectedRevision, '课次');
      const pending = await this.repository.countPendingAttendance(session.id, transaction);
      if (pending > 0) {
        throw new ApiError(
          409,
          'LESSON_SESSION_ATTENDANCE_PENDING',
          '仍有学员未点名，不能完成课次',
          {
            pending,
          },
        );
      }
      return this.transitionLocked(session, 'completed', null, context, transaction);
    });
  }

  async cancel(
    institutionId: string,
    sessionId: string,
    input: CancelLessonSessionRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    return this.database.transaction(async (transaction) => {
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      if (!['draft', 'open'].includes(session.status)) {
        throw new ApiError(409, 'LESSON_SESSION_NOT_CANCELLABLE', '该课次当前不能取消');
      }
      this.assertRevision(session.revision, input.expectedRevision, '课次');
      const active = await this.repository.countActiveConsumptions(session.id, transaction);
      if (active > 0) {
        throw new ApiError(409, 'LESSON_SESSION_HAS_CONSUMPTIONS', '课次已有消课，请先逐笔撤销', {
          active,
        });
      }
      return this.transitionLocked(
        session,
        'cancelled',
        input.reason ?? null,
        context,
        transaction,
      );
    });
  }

  async roster(institutionId: string, sessionId: string, scope: EducationDataScope) {
    this.assertInstitutionId(institutionId, scope);
    const session = await this.repository.find(institutionId, sessionId);
    if (!session) throw this.notFound();
    await this.assertSessionAccess(session.id, scope);
    const rows = await this.repository.listRoster(session.id);
    return { items: rows.map((record) => this.rosterView(record)) };
  }

  async addStudents(
    institutionId: string,
    sessionId: string,
    input: AddLessonSessionStudentsRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    try {
      return await this.database.transaction(async (transaction) => {
        const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
        if (!['draft', 'open'].includes(session.status)) {
          throw new ApiError(
            409,
            'LESSON_SESSION_ROSTER_LOCKED',
            '已结束或已取消的课次不能修改名单',
          );
        }
        this.assertRevision(session.revision, input.expectedRevision, '课次');
        const studentSnapshots = await Promise.all(
          input.studentIds.map((studentId) =>
            this.students.getActiveStudentSnapshot(studentId, institutionId, transaction),
          ),
        );
        const added = await this.repository.addRosterEntries(
          session,
          studentSnapshots.map((student) => ({
            studentId: student.id,
            studentNameSnapshot: student.fullName,
          })),
          transaction,
        );
        if (!added.session) throw this.versionConflict('课次');
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-session.roster-added',
            resourceType: 'lesson-session',
            resourceId: session.id,
            metadata: { studentIds: studentSnapshots.map((student) => student.id) },
          },
          transaction,
        );
        return {
          session: this.sessionView(added.session),
          roster: { items: added.rows.map((record) => this.rosterView(record)) },
        };
      });
    } catch (error) {
      if (this.repository.isRosterDuplicate(error)) {
        throw new ApiError(409, 'LESSON_SESSION_STUDENT_EXISTS', '名单中已存在所选学员');
      }
      throw error;
    }
  }

  async recordAttendance(
    institutionId: string,
    sessionId: string,
    rosterEntryId: string,
    input: RecordLessonSessionAttendanceRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionId(institutionId, scope);
    return this.database.transaction(async (transaction) => {
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      await this.assertSessionAccess(session.id, scope, transaction);
      if (session.status !== 'open') {
        throw new ApiError(409, 'LESSON_SESSION_NOT_OPEN', '只有进行中的课次可以点名');
      }
      const record = await this.requireRosterForUpdate(session.id, rosterEntryId, transaction);
      return this.recordAttendanceLocked(
        session,
        record,
        input.attendanceStatus,
        input.expectedRevision,
        context,
        transaction,
      );
    });
  }

  async recordAttendances(
    institutionId: string,
    sessionId: string,
    input: RecordLessonSessionAttendancesRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionId(institutionId, scope);
    return this.database.transaction(async (transaction) => {
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      await this.assertSessionAccess(session.id, scope, transaction);
      if (session.status !== 'open') {
        throw new ApiError(409, 'LESSON_SESSION_NOT_OPEN', '只有进行中的课次可以点名');
      }
      const items: LessonSessionRosterEntry[] = [];
      for (const inputItem of input.items) {
        const record = await this.requireRosterForUpdate(
          session.id,
          inputItem.rosterEntryId,
          transaction,
        );
        items.push(
          await this.recordAttendanceLocked(
            session,
            record,
            inputItem.attendanceStatus,
            inputItem.expectedRevision,
            context,
            transaction,
          ),
        );
      }
      return { items };
    });
  }

  async consume(
    institutionId: string,
    sessionId: string,
    rosterEntryId: string,
    input: ConsumeLessonSessionStudentRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ): Promise<LessonSessionConsumptionResult> {
    this.assertInstitutionWriteScope(institutionId, scope);
    const executed = await this.idempotency.execute(
      { operation: 'lesson-session.consume', resultSchema: lessonSessionConsumptionResultSchema },
      {
        scope: `lesson-session-roster:${rosterEntryId}`,
        key: input.operationId,
        request: { institutionId, sessionId, rosterEntryId, ...input },
        actorId: context.actorId,
      },
      async (transaction) => {
        const consumptionSource = input.consumptionSource ?? 'lesson_units';
        const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
        if (!['open', 'completed'].includes(session.status)) {
          throw new ApiError(409, 'LESSON_SESSION_NOT_CONSUMABLE', '该课次当前不能消课');
        }
        const record = await this.requireRosterForUpdate(session.id, rosterEntryId, transaction);
        this.assertRevision(record.revision, input.expectedRevision, '消课记录');
        if (!canConsumeAttendance(record.attendanceStatus)) {
          throw new ApiError(409, 'ATTENDANCE_NOT_CONSUMABLE', '只有出勤或迟到状态可以消课');
        }
        if (!['not_consumed', 'failed', 'reversed'].includes(record.consumptionStatus)) {
          throw new ApiError(409, 'LESSON_SESSION_ALREADY_CONSUMED', '该学员课次已经处理过消课');
        }
        let lessonMutation: Awaited<
          ReturnType<LessonConsumptionLedger['consumeInTransaction']>
        > | null = null;
        let periodCardUsageId: string | null = null;
        try {
          if (consumptionSource === 'period_card') {
            const periodMutation = await this.periodCards.useInTransaction(
              {
                institutionId,
                studentId: record.studentId,
                entitlementId: input.periodCardEntitlementId!,
                quantity: input.units,
                reason: input.reason ?? `课次使用周期卡：${session.name}`,
                sourceReference: `lesson-session:${session.id}:roster:${record.id}`,
                occurredAt: session.startsAt,
                operationId: input.operationId,
              },
              context,
              transaction,
            );
            periodCardUsageId = periodMutation.usage.id;
          } else {
            lessonMutation = await this.lessonAccounts.consumeInTransaction(
              {
                institutionId,
                studentId: record.studentId,
                units: input.units,
                reason: input.reason ?? `课次消课：${session.name}`,
                sourceReference: `lesson-session:${session.id}:roster:${record.id}`,
                metadata: { lessonSessionId: session.id, rosterEntryId: record.id },
              },
              context,
              transaction,
            );
          }
        } catch (error) {
          if (
            !(error instanceof ApiError) ||
            !(
              ['LESSON_BALANCE_INSUFFICIENT', 'LESSON_BATCH_BALANCE_MISMATCH'].includes(
                error.code,
              ) || error.code.startsWith('PERIOD_CARD_')
            )
          ) {
            throw error;
          }
          const failed = await this.repository.markConsumptionFailed(
            record,
            {
              operationId: input.operationId,
              errorCode: error.code,
              errorMessage: error.message,
              source: consumptionSource,
              periodCardEntitlementId: input.periodCardEntitlementId,
            },
            transaction,
          );
          if (!failed) throw this.versionConflict('消课记录');
          await this.auditRosterConsumption('failed', failed, context, transaction);
          return this.consumptionResult(failed);
        }
        const updated =
          consumptionSource === 'period_card'
            ? await this.repository.markPeriodCardConsumed(
                record,
                {
                  units: input.units,
                  entitlementId: input.periodCardEntitlementId!,
                  usageId: periodCardUsageId!,
                  operationId: input.operationId,
                },
                transaction,
              )
            : await this.repository.markConsumed(
                record,
                {
                  units: input.units,
                  movementId: lessonMutation!.movement.id,
                  operationId: input.operationId,
                },
                transaction,
              );
        if (!updated) throw this.versionConflict('消课记录');
        await this.auditRosterConsumption('consumed', updated, context, transaction);
        return this.consumptionResult(updated);
      },
    );
    return executed.value;
  }

  async consumeMany(
    institutionId: string,
    sessionId: string,
    input: ConsumeLessonSessionStudentsRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    const items: LessonSessionConsumptionResult[] = [];
    for (const item of input.items) {
      items.push(
        await this.consume(
          institutionId,
          sessionId,
          item.rosterEntryId,
          { ...item, operationId: input.operationId },
          scope,
          context,
        ),
      );
    }
    return { operationId: input.operationId, items };
  }

  async reverse(
    institutionId: string,
    sessionId: string,
    rosterEntryId: string,
    input: ReverseLessonSessionConsumptionRequest,
    scope: EducationDataScope,
    context: LessonSessionActor,
  ) {
    this.assertInstitutionWriteScope(institutionId, scope);
    const executed = await this.idempotency.execute(
      {
        operation: 'lesson-session.consume-reversal',
        resultSchema: lessonSessionConsumptionResultSchema,
      },
      {
        scope: `lesson-session-roster:${rosterEntryId}`,
        key: input.operationId,
        request: { institutionId, sessionId, rosterEntryId, ...input },
        actorId: context.actorId,
      },
      async (transaction) => {
        const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
        if (session.status === 'cancelled') {
          throw new ApiError(409, 'LESSON_SESSION_CANCELLED', '已取消课次不存在待撤销消课');
        }
        const record = await this.requireRosterForUpdate(session.id, rosterEntryId, transaction);
        this.assertRevision(record.revision, input.expectedRevision, '消课记录');
        if (record.consumptionStatus !== 'consumed' || !record.consumptionSource) {
          throw new ApiError(409, 'LESSON_SESSION_NOT_CONSUMED', '该学员课次没有可撤销的消课');
        }
        let reversalMovementId: string | null = null;
        if (record.consumptionSource === 'period_card') {
          if (!record.periodCardUsageId) {
            throw new ApiError(409, 'LESSON_SESSION_PERIOD_USAGE_MISSING', '周期卡使用记录缺失');
          }
          await this.periodCards.reverseInTransaction(
            {
              institutionId,
              usageId: record.periodCardUsageId,
              operationId: input.operationId,
              reason: input.reason,
            },
            context,
            transaction,
          );
        } else {
          if (!record.consumptionMovementId) {
            throw new ApiError(409, 'LESSON_SESSION_MOVEMENT_MISSING', '课时消费流水缺失');
          }
          const mutation = await this.lessonAccounts.reverseConsumptionInTransaction(
            {
              institutionId,
              studentId: record.studentId,
              movementId: record.consumptionMovementId,
              reason: input.reason,
              sourceReference: `lesson-session:${session.id}:roster:${record.id}:reversal`,
              metadata: { lessonSessionId: session.id, rosterEntryId: record.id },
            },
            context,
            transaction,
          );
          reversalMovementId = mutation.movement.id;
        }
        const updated = await this.repository.markReversed(
          record,
          { reversalMovementId, operationId: input.operationId },
          transaction,
        );
        if (!updated) throw this.versionConflict('消课记录');
        await this.auditRosterConsumption('reversed', updated, context, transaction);
        return this.consumptionResult(updated);
      },
    );
    return executed.value;
  }

  private async transition(
    institutionId: string,
    sessionId: string,
    expectedRevision: number,
    from: LessonSessionRecord['status'],
    to: LessonSessionRecord['status'],
    reason: string | null,
    context: LessonSessionActor,
  ) {
    return this.database.transaction(async (transaction) => {
      const session = await this.requireSessionForUpdate(institutionId, sessionId, transaction);
      if (session.status !== from) {
        throw new ApiError(409, 'LESSON_SESSION_STATE_CONFLICT', `只有${from}状态可以变更为${to}`);
      }
      this.assertRevision(session.revision, expectedRevision, '课次');
      return this.transitionLocked(session, to, reason, context, transaction);
    });
  }

  private async transitionLocked(
    session: LessonSessionRecord,
    status: LessonSessionRecord['status'],
    reason: string | null,
    context: LessonSessionActor,
    transaction: DatabaseTransaction,
  ) {
    const updated = await this.repository.transition(session, status, transaction, reason);
    if (!updated) throw this.versionConflict('课次');
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: `lesson-session.${status}`,
        resourceType: 'lesson-session',
        resourceId: session.id,
        changes: [{ field: 'status', before: session.status, after: status }],
        metadata: reason ? { reason } : undefined,
      },
      transaction,
    );
    return this.sessionView(updated);
  }

  private async requireSessionForUpdate(
    institutionId: string,
    sessionId: string,
    transaction: DatabaseTransaction,
  ) {
    const session = await this.repository.findForUpdate(institutionId, sessionId, transaction);
    if (!session) throw this.notFound();
    return session;
  }

  private async requireRosterForUpdate(
    sessionId: string,
    rosterEntryId: string,
    transaction: DatabaseTransaction,
  ) {
    const record = await this.repository.findRosterForUpdate(sessionId, rosterEntryId, transaction);
    if (!record) throw new ApiError(404, 'LESSON_SESSION_ROSTER_NOT_FOUND', '课次名单记录不存在');
    return record;
  }

  private async recordAttendanceLocked(
    session: LessonSessionRecord,
    record: LessonSessionAttendanceRecord,
    attendanceStatus: LessonSessionAttendanceStatus,
    expectedRevision: number,
    context: LessonSessionActor,
    transaction: DatabaseTransaction,
  ) {
    this.assertRevision(record.revision, expectedRevision, '点名记录');
    if (record.consumptionStatus === 'consumed' && !canConsumeAttendance(attendanceStatus)) {
      throw new ApiError(409, 'ATTENDANCE_HAS_CONSUMPTION', '已消课记录只能保持出勤或迟到状态');
    }
    const updated = await this.repository.recordAttendance(
      record,
      attendanceStatus,
      context.actorId,
      transaction,
    );
    if (!updated) throw this.versionConflict('点名记录');
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: 'lesson-session.attendance-recorded',
        resourceType: 'lesson-session.attendance',
        resourceId: record.id,
        changes: [
          {
            field: 'attendanceStatus',
            before: record.attendanceStatus,
            after: updated.attendanceStatus,
          },
        ],
        metadata: {
          sessionId: session.id,
          institutionId: session.institutionId,
          studentId: record.studentId,
        },
      },
      transaction,
    );
    return this.rosterView(updated);
  }

  private async auditRosterConsumption(
    state: 'consumed' | 'failed' | 'reversed',
    record: LessonSessionAttendanceRecord,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ) {
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: `lesson-session.consumption-${state}`,
        resourceType: 'lesson-session.attendance',
        resourceId: record.id,
        metadata: {
          sessionId: record.sessionId,
          studentId: record.studentId,
          units: record.consumedUnits,
          movementId: record.consumptionMovementId,
          reversalMovementId: record.reversalMovementId,
          operationId: record.reversalOperationId ?? record.consumptionOperationId,
          errorCode: record.consumptionErrorCode,
        },
      },
      transaction,
    );
  }

  private sessionView(record: LessonSessionRecord): LessonSession {
    return {
      id: record.id,
      institutionId: record.institutionId,
      name: record.name,
      startsAt: record.startsAt.toISOString(),
      endsAt: record.endsAt.toISOString(),
      status: record.status,
      source: record.source,
      defaultUnits: record.defaultUnits,
      notes: record.notes,
      cancellationReason: record.cancellationReason,
      openedAt: record.openedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private rosterView(record: LessonSessionAttendanceRecord): LessonSessionRosterEntry {
    return {
      id: record.id,
      lessonSessionId: record.sessionId,
      institutionId: record.institutionId,
      studentId: record.studentId,
      studentNameSnapshot: record.studentNameSnapshot,
      attendanceStatus: record.attendanceStatus,
      attendanceRecordedAt: record.attendanceRecordedAt?.toISOString() ?? null,
      attendanceRecordedBy: record.attendanceRecordedBy,
      consumptionStatus: record.consumptionStatus,
      consumptionSource: record.consumptionSource,
      plannedUnits: record.plannedUnits,
      consumedUnits: record.consumedUnits > 0 ? record.consumedUnits : null,
      movementId: record.consumptionMovementId,
      reversalMovementId: record.reversalMovementId,
      periodCardEntitlementId: record.periodCardEntitlementId,
      periodCardUsageId: record.periodCardUsageId,
      consumptionOperationId: record.consumptionOperationId,
      reversalOperationId: record.reversalOperationId,
      consumedAt: record.consumedAt?.toISOString() ?? null,
      reversedAt: record.reversedAt?.toISOString() ?? null,
      consumptionErrorCode: record.consumptionErrorCode,
      consumptionErrorMessage: record.consumptionErrorMessage,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private consumptionResult(record: LessonSessionAttendanceRecord): LessonSessionConsumptionResult {
    return {
      rosterEntry: this.rosterView(record),
      movementId: record.reversalMovementId ?? record.consumptionMovementId,
      periodCardUsageId: record.periodCardUsageId,
      consumedAt: record.consumedAt?.toISOString() ?? null,
      reversedAt: record.reversedAt?.toISOString() ?? null,
      errorCode: record.consumptionErrorCode,
      errorMessage: record.consumptionErrorMessage,
    };
  }

  private teacherAssignmentView(
    record: LessonSessionTeacherRecord,
  ): LessonSessionTeacherAssignment {
    return {
      lessonSessionId: record.sessionId,
      institutionId: record.institutionId,
      teacherId: record.teacherId,
      teacherNameSnapshot: record.teacherNameSnapshot,
      role: record.role,
      assignedBy: record.assignedBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private assertInstitutionId(institutionId: string, scope: EducationDataScope) {
    if (scope.institutionId !== institutionId) {
      throw new ApiError(403, 'LESSON_SESSION_SCOPE_DENIED', '课次不在当前机构数据范围');
    }
  }

  private async assertSessionAccess(
    sessionId: string,
    scope: EducationDataScope,
    executor: import('../../../database/database.js').DatabaseExecutor = this.database.db,
  ) {
    if (scope.kind === 'institution') return;
    if (
      scope.kind === 'teacher' &&
      (await this.repository.isTeacherAssigned(sessionId, scope.teacherId, executor))
    ) {
      return;
    }
    throw new ApiError(404, 'LESSON_SESSION_NOT_FOUND', '课次不存在或不在当前教师工作范围');
  }

  private assertInstitutionWriteScope(
    institutionId: string,
    scope: EducationDataScope,
  ): asserts scope is Extract<EducationDataScope, { kind: 'institution' }> {
    this.assertInstitutionId(institutionId, scope);
    if (scope.kind !== 'institution') {
      throw new ApiError(403, 'LESSON_SESSION_SCOPE_DENIED', '当前操作仅对机构管理范围开放');
    }
  }

  private assertRevision(actual: number, expected: number, resource: string) {
    if (actual !== expected) throw this.versionConflict(resource, expected, actual);
  }

  private versionConflict(resource: string, expectedRevision?: number, actualRevision?: number) {
    return new ApiError(
      409,
      'LESSON_SESSION_VERSION_CONFLICT',
      `${resource}已被其他操作更新，请刷新后重试`,
      {
        expectedRevision,
        actualRevision,
      },
    );
  }

  private notFound() {
    return new ApiError(404, 'LESSON_SESSION_NOT_FOUND', '课次不存在或不在当前机构');
  }
}
