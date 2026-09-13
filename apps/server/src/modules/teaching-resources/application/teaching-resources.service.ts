import { ApiError } from '@lingcoo-tech/http';
import type {
  Campus,
  CampusListQuery,
  ClassGroup,
  ClassGroupListQuery,
  ClassMembership,
  EducationDataScope,
  Classroom,
  ClassroomListQuery,
  Course,
  CourseListQuery,
  CreateCampusRequest,
  CreateClassGroupRequest,
  CreateClassroomRequest,
  CreateCourseRequest,
  CreateScheduleRequest,
  GenerateScheduleRequest,
  GenerateScheduleResponse,
  ReplaceClassMembershipsRequest,
  ReplaceScheduleTeachersRequest,
  Schedule,
  ScheduleConflict,
  ScheduleListQuery,
  ScheduleTeacherAssignment,
  SessionResourceContext,
  UpdateCampusRequest,
  UpdateClassGroupRequest,
  UpdateClassroomRequest,
  UpdateCourseRequest,
  UpdateScheduleRequest,
  UpdateSessionResourceContextRequest,
  Student360ClassMembership,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../database/database.js';
import { acquireSchedulingConflictLock } from '../../../database/scheduling-lock.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type {
  LessonSessionResourceConflictPolicy,
  LessonSessionSchedulingPort,
} from '../../lesson-sessions/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { StudentDirectory, TeacherDirectory } from '../../people/public.js';
import { enumerateLocalOccurrences } from '../domain/recurrence.js';
import {
  TeachingResourcesRepository,
  type CampusRecord,
  type ClassGroupRecord,
  type ClassMembershipRecord,
  type ClassroomRecord,
  type CourseRecord,
  type ScheduleRecord,
  type ScheduleTeacherRecord,
  type SessionResourceContextRecord,
} from '../infrastructure/persistence/teaching-resources.repository.js';

export interface TeachingResourceActor extends AuditContext {
  actorId: string;
}

export class TeachingResourcesService implements LessonSessionResourceConflictPolicy {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: TeachingResourcesRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly students: StudentDirectory,
    private readonly teachers: TeacherDirectory,
    private readonly sessions: LessonSessionSchedulingPort,
    private readonly audit: AuditWriter,
  ) {}

  async assertResourceTimeAvailable(
    institutionId: string,
    sessionId: string,
    startsAt: Date,
    endsAt: Date,
    transaction: DatabaseTransaction,
  ) {
    const current = await this.repository.findSessionContext(institutionId, sessionId, transaction);
    if (!current?.classroomId) return;
    const classroom = await this.requireClassroom(current.classroomId, transaction);
    await this.assertClassroomAvailable(
      institutionId,
      sessionId,
      startsAt,
      endsAt,
      classroom,
      transaction,
    );
  }

  async listCampuses(input: CampusListQuery) {
    const result = await this.repository.listCampuses(input);
    return {
      ...result,
      items: result.items.map((row) => this.campusView(row)),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async getCampus(campusId: string) {
    return this.campusView(await this.requireCampus(campusId));
  }

  async createCampus(input: CreateCampusRequest, context: AuditContext): Promise<Campus> {
    return this.mutate('campus.created', 'teaching.campus', context, async (transaction) => {
      const row = await this.repository.createCampus(input, transaction);
      return { id: row.id, value: this.campusView(row) };
    });
  }

  async updateCampus(campusId: string, input: UpdateCampusRequest, context: AuditContext) {
    return this.mutate('campus.updated', 'teaching.campus', context, async (transaction) => {
      await this.requireCampus(campusId, transaction);
      const row = await this.repository.updateCampus(campusId, input, transaction);
      if (!row) throw this.versionConflict('校区');
      return { id: row.id, value: this.campusView(row) };
    });
  }

  async listClassrooms(campusId: string, input: ClassroomListQuery) {
    await this.requireCampus(campusId);
    const result = await this.repository.listClassrooms(campusId, input);
    return {
      ...result,
      items: result.items.map((row) => this.classroomView(row)),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async createClassroom(campusId: string, input: CreateClassroomRequest, context: AuditContext) {
    return this.mutate('classroom.created', 'teaching.classroom', context, async (transaction) => {
      await this.requireActiveCampus(campusId, transaction);
      const row = await this.repository.createClassroom(campusId, input, transaction);
      return { id: row.id, value: this.classroomView(row) };
    });
  }

  async updateClassroom(
    campusId: string,
    classroomId: string,
    input: UpdateClassroomRequest,
    context: AuditContext,
  ) {
    return this.mutate('classroom.updated', 'teaching.classroom', context, async (transaction) => {
      const before = await this.requireClassroom(classroomId, transaction);
      if (before.campusId !== campusId) throw this.notFound('CLASSROOM_NOT_FOUND', '教室不存在');
      const row = await this.repository.updateClassroom(campusId, classroomId, input, transaction);
      if (!row) throw this.versionConflict('教室');
      return { id: row.id, value: this.classroomView(row) };
    });
  }

  async listCourses(institutionId: string, input: CourseListQuery) {
    const result = await this.repository.listCourses(institutionId, input);
    return {
      ...result,
      items: result.items.map((row) => this.courseView(row)),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async createCourse(institutionId: string, input: CreateCourseRequest, context: AuditContext) {
    return this.mutate('course.created', 'teaching.course', context, async (transaction) => {
      await this.institutions.assertActiveInstitution(institutionId, transaction);
      const row = await this.repository.createCourse(institutionId, input, transaction);
      return { id: row.id, value: this.courseView(row) };
    });
  }

  async updateCourse(
    institutionId: string,
    courseId: string,
    input: UpdateCourseRequest,
    context: AuditContext,
  ) {
    return this.mutate('course.updated', 'teaching.course', context, async (transaction) => {
      await this.requireInstitutionCourse(institutionId, courseId, transaction);
      const row = await this.repository.updateCourse(institutionId, courseId, input, transaction);
      if (!row) throw this.versionConflict('课程');
      return { id: row.id, value: this.courseView(row) };
    });
  }

  async listClassGroups(institutionId: string, input: ClassGroupListQuery) {
    const result = await this.repository.listClassGroups(institutionId, input);
    return {
      ...result,
      items: result.items.map((row) => this.classGroupView(row)),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async createClassGroup(
    institutionId: string,
    input: CreateClassGroupRequest,
    context: AuditContext,
  ) {
    return this.mutate('class.created', 'teaching.class', context, async (transaction) => {
      await this.institutions.assertActiveInstitution(institutionId, transaction);
      await this.validateResources(institutionId, input, transaction, false);
      const row = await this.repository.createClassGroup(institutionId, input, transaction);
      return { id: row.id, value: this.classGroupView(row) };
    });
  }

  async updateClassGroup(
    institutionId: string,
    classGroupId: string,
    input: UpdateClassGroupRequest,
    context: AuditContext,
  ) {
    return this.mutate('class.updated', 'teaching.class', context, async (transaction) => {
      const before = await this.requireInstitutionClass(institutionId, classGroupId, transaction);
      await this.validateResources(
        institutionId,
        {
          courseId: input.courseId === undefined ? before.courseId : input.courseId,
          campusId: input.campusId === undefined ? before.campusId : input.campusId,
          classroomId: input.classroomId === undefined ? before.classroomId : input.classroomId,
        },
        transaction,
        false,
      );
      const row = await this.repository.updateClassGroup(
        institutionId,
        classGroupId,
        input,
        transaction,
      );
      if (!row) throw this.versionConflict('班级');
      return { id: row.id, value: this.classGroupView(row) };
    });
  }

  async listClassMemberships(
    institutionId: string,
    classGroupId: string,
    page: number,
    pageSize: number,
  ) {
    await this.requireInstitutionClass(institutionId, classGroupId);
    const result = await this.repository.listClassMemberships(classGroupId, page, pageSize);
    return {
      items: result.items.map((row) => this.membershipView(row)),
      page,
      pageSize,
      total: result.total,
    };
  }

  async listStudentClassMemberships(
    institutionId: string,
    studentId: string,
    scope: EducationDataScope,
  ): Promise<Student360ClassMembership[]> {
    await this.students.assertStudentAccess(studentId, scope, this.database.db);
    const rows = await this.repository.listStudentClassMemberships(institutionId, studentId);
    return rows.map((row) => ({
      classGroup: this.classGroupView(row.classGroup),
      membership: this.membershipView(row.membership),
    }));
  }

  async replaceClassMemberships(
    institutionId: string,
    classGroupId: string,
    input: ReplaceClassMembershipsRequest,
    context: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const group = await this.repository.findClassGroupForUpdate(
        institutionId,
        classGroupId,
        transaction,
      );
      if (!group) throw this.notFound('CLASS_NOT_FOUND', '班级不存在');
      this.assertRevision(group.revision, input.expectedRevision, '班级');
      const snapshots = await Promise.all(
        input.studentIds.map((studentId) =>
          this.students.getActiveStudentSnapshot(studentId, institutionId, transaction),
        ),
      );
      const replaced = await this.repository.replaceClassMemberships(group, snapshots, transaction);
      if (!replaced.classGroup) throw this.versionConflict('班级');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'class.members-replaced',
          resourceType: 'teaching.class',
          resourceId: classGroupId,
          metadata: { institutionId, studentIds: input.studentIds },
        },
        transaction,
      );
      return { items: replaced.items.map((row) => this.membershipView(row)) };
    });
  }

  async listSchedules(institutionId: string, input: ScheduleListQuery) {
    const result = await this.repository.listSchedules(institutionId, input);
    return {
      ...result,
      items: result.items.map((row) => this.scheduleView(row)),
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async createSchedule(institutionId: string, input: CreateScheduleRequest, context: AuditContext) {
    return this.mutate('schedule.created', 'teaching.schedule', context, async (transaction) => {
      await this.institutions.assertActiveInstitution(institutionId, transaction);
      await this.validateResources(institutionId, input, transaction, false);
      const row = await this.repository.createSchedule(institutionId, input, transaction);
      return { id: row.id, value: this.scheduleView(row) };
    });
  }

  async updateSchedule(
    institutionId: string,
    scheduleId: string,
    input: UpdateScheduleRequest,
    context: AuditContext,
  ) {
    return this.mutate('schedule.updated', 'teaching.schedule', context, async (transaction) => {
      const before = await this.requireInstitutionSchedule(institutionId, scheduleId, transaction);
      const merged = {
        courseId: input.courseId === undefined ? before.courseId : input.courseId,
        classGroupId: input.classGroupId === undefined ? before.classGroupId : input.classGroupId,
        campusId: input.campusId === undefined ? before.campusId : input.campusId,
        classroomId: input.classroomId === undefined ? before.classroomId : input.classroomId,
      };
      await this.validateResources(institutionId, merged, transaction, false);
      const startDate = input.startDate ?? before.startDate;
      const endDate = input.endDate ?? before.endDate;
      if (endDate < startDate)
        throw new ApiError(400, 'SCHEDULE_DATE_RANGE_INVALID', '结束日期不能早于开始日期');
      const row = await this.repository.updateSchedule(
        institutionId,
        scheduleId,
        input,
        transaction,
      );
      if (!row) throw this.versionConflict('排课');
      return { id: row.id, value: this.scheduleView(row) };
    });
  }

  async listScheduleTeachers(institutionId: string, scheduleId: string) {
    const schedule = await this.requireInstitutionSchedule(institutionId, scheduleId);
    const rows = await this.repository.listScheduleTeachers(scheduleId);
    return {
      schedule: this.scheduleView(schedule),
      items: rows.map((row) => this.scheduleTeacherView(row)),
    };
  }

  async replaceScheduleTeachers(
    institutionId: string,
    scheduleId: string,
    input: ReplaceScheduleTeachersRequest,
    context: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const schedule = await this.repository.findScheduleForUpdate(
        institutionId,
        scheduleId,
        transaction,
      );
      if (!schedule) throw this.notFound('SCHEDULE_NOT_FOUND', '排课不存在');
      this.assertRevision(schedule.revision, input.expectedRevision, '排课');
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
      const replaced = await this.repository.replaceScheduleTeachers(
        schedule,
        snapshots,
        transaction,
      );
      if (!replaced.schedule) throw this.versionConflict('排课');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'schedule.teachers-replaced',
          resourceType: 'teaching.schedule',
          resourceId: scheduleId,
          metadata: { institutionId, assignments: input.assignments },
        },
        transaction,
      );
      return {
        schedule: this.scheduleView(replaced.schedule),
        items: replaced.rows.map((row) => this.scheduleTeacherView(row)),
      };
    });
  }

  async generate(
    institutionId: string,
    scheduleId: string,
    input: GenerateScheduleRequest,
    context: TeachingResourceActor,
  ): Promise<GenerateScheduleResponse> {
    return this.database.transaction(async (transaction) => {
      await acquireSchedulingConflictLock(transaction);
      const schedule = await this.repository.findScheduleForUpdate(
        institutionId,
        scheduleId,
        transaction,
      );
      if (!schedule) throw this.notFound('SCHEDULE_NOT_FOUND', '排课不存在');
      if (schedule.status !== 'active')
        throw new ApiError(409, 'SCHEDULE_INACTIVE', '停用排课不能生成课次');
      this.assertRevision(schedule.revision, input.expectedRevision, '排课');
      if (input.allowConflicts && !input.conflictReason) {
        throw new ApiError(400, 'SCHEDULE_CONFLICT_REASON_REQUIRED', '允许冲突时必须填写原因');
      }
      const fromDate = maxDate(schedule.startDate, input.fromDate ?? schedule.startDate);
      const toDate = minDate(schedule.endDate, input.toDate ?? schedule.endDate);
      let occurrences = [] as ReturnType<typeof enumerateLocalOccurrences>;
      if (fromDate <= toDate) {
        try {
          occurrences = enumerateLocalOccurrences({
            startDate: fromDate,
            endDate: toDate,
            weekdays: schedule.weekdays,
            startTime: schedule.startTime.slice(0, 5),
            durationMinutes: schedule.durationMinutes,
            timeZone: schedule.timeZone,
          });
        } catch (error) {
          this.translateRecurrenceError(error);
        }
      }
      const existingDates = new Set(
        (
          await this.repository.existingOccurrenceDates(
            schedule.id,
            occurrences.map((item) => item.localDate),
            transaction,
          )
        ).map((item) => item.localDate),
      );
      const skippedDates = occurrences
        .filter((item) => existingDates.has(item.localDate))
        .map((item) => item.localDate);
      occurrences = occurrences.filter((item) => !existingDates.has(item.localDate));

      const resources = await this.validateResources(institutionId, schedule, transaction, true);
      const scheduleTeachers = await this.repository.listScheduleTeachers(schedule.id, transaction);
      const teacherSnapshots = await Promise.all(
        scheduleTeachers.map(async (assignment) => ({
          ...(await this.teachers.getActiveTeacherSnapshot(
            assignment.teacherId,
            institutionId,
            transaction,
          )),
          role: assignment.role,
        })),
      );
      const classStudents =
        input.includeClassStudents && schedule.classGroupId
          ? (
              await this.repository.listClassMemberships(
                schedule.classGroupId,
                1,
                500,
                true,
                transaction,
              )
            ).items
          : [];

      const overlaps = occurrences.length
        ? await this.sessions.listSchedulingOverlaps(
            institutionId,
            new Date(Math.max(...occurrences.map((item) => item.endsAt.getTime()))),
            new Date(Math.min(...occurrences.map((item) => item.startsAt.getTime()))),
            transaction,
          )
        : [];
      const contexts = await this.repository.listContexts(
        overlaps.map((item) => item.sessionId),
        transaction,
      );
      const contextBySession = new Map(contexts.map((item) => [item.sessionId, item]));
      const conflicts = this.detectConflicts(
        occurrences,
        overlaps,
        contextBySession,
        teacherSnapshots,
        resources.classroom,
      );
      if (conflicts.length > 0 && !input.allowConflicts) {
        throw new ApiError(409, 'SCHEDULE_CONFLICT', '排课与已有课次发生教师或教室冲突', {
          conflicts,
        });
      }

      const createdSessions: GenerateScheduleResponse['createdSessions'] = [];
      for (const occurrence of occurrences) {
        const session = await this.sessions.createScheduledSession(
          {
            institutionId,
            name: schedule.sessionName,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            defaultUnits: schedule.defaultUnits,
            notes: null,
            students: classStudents.map((membership) => ({
              studentId: membership.studentId,
              studentNameSnapshot: membership.studentNameSnapshot,
            })),
            teachers: teacherSnapshots.map((teacher) => ({
              teacherId: teacher.id,
              teacherNameSnapshot: teacher.fullName,
              role: teacher.role,
            })),
            assignedBy: context.actorId,
          },
          transaction,
        );
        await this.repository.saveSessionContext(
          {
            sessionId: session.id,
            institutionId,
            scheduleId: schedule.id,
            scheduleNameSnapshot: schedule.name,
            courseId: resources.course?.id ?? null,
            courseNameSnapshot: resources.course?.name ?? null,
            classGroupId: resources.classGroup?.id ?? null,
            classGroupNameSnapshot: resources.classGroup?.name ?? null,
            campusId: resources.campus?.id ?? null,
            campusNameSnapshot: resources.campus?.name ?? null,
            classroomId: resources.classroom?.id ?? null,
            classroomNameSnapshot: resources.classroom?.name ?? null,
          },
          transaction,
        );
        await this.repository.addOccurrence(
          {
            scheduleId: schedule.id,
            institutionId,
            localDate: occurrence.localDate,
            sessionId: session.id,
            generatedBy: context.actorId,
            overrideReason: input.allowConflicts ? (input.conflictReason ?? null) : null,
          },
          transaction,
        );
        const now = new Date();
        createdSessions.push({
          id: session.id,
          institutionId,
          name: schedule.sessionName,
          startsAt: occurrence.startsAt.toISOString(),
          endsAt: occurrence.endsAt.toISOString(),
          status: 'draft',
          source: 'schedule',
          defaultUnits: schedule.defaultUnits,
          notes: null,
          cancellationReason: null,
          openedAt: null,
          completedAt: null,
          cancelledAt: null,
          revision: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action:
            input.allowConflicts && conflicts.length
              ? 'schedule.generated-with-conflicts'
              : 'schedule.generated',
          resourceType: 'teaching.schedule',
          resourceId: schedule.id,
          metadata: {
            institutionId,
            includeClassStudents: input.includeClassStudents ?? false,
            createdCount: createdSessions.length,
            skippedDates,
            conflicts,
            conflictReason: input.allowConflicts ? input.conflictReason : null,
          },
        },
        transaction,
      );
      return { schedule: this.scheduleView(schedule), createdSessions, skippedDates, conflicts };
    });
  }

  async getSessionResourceContext(institutionId: string, sessionId: string) {
    const session = await this.sessions.getSchedulingSession(institutionId, sessionId);
    if (!session) throw this.notFound('LESSON_SESSION_NOT_FOUND', '课次不存在');
    return this.sessionContextView(
      (await this.repository.findSessionContext(institutionId, sessionId)) ?? {
        sessionId,
        institutionId,
        scheduleId: null,
        scheduleNameSnapshot: null,
        courseId: null,
        courseNameSnapshot: null,
        classGroupId: null,
        classGroupNameSnapshot: null,
        campusId: null,
        campusNameSnapshot: null,
        classroomId: null,
        classroomNameSnapshot: null,
        createdAt: new Date(),
      },
    );
  }

  async updateSessionResourceContext(
    institutionId: string,
    sessionId: string,
    input: UpdateSessionResourceContextRequest,
    context: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      await acquireSchedulingConflictLock(transaction);
      const session = await this.sessions.getSchedulingSession(
        institutionId,
        sessionId,
        transaction,
      );
      if (!session) throw this.notFound('LESSON_SESSION_NOT_FOUND', '课次不存在');
      const current = await this.repository.findSessionContext(
        institutionId,
        sessionId,
        transaction,
      );
      const ids = {
        scheduleId:
          input.scheduleId === undefined ? (current?.scheduleId ?? null) : input.scheduleId,
        courseId: input.courseId === undefined ? (current?.courseId ?? null) : input.courseId,
        classGroupId:
          input.classGroupId === undefined ? (current?.classGroupId ?? null) : input.classGroupId,
        campusId: input.campusId === undefined ? (current?.campusId ?? null) : input.campusId,
        classroomId:
          input.classroomId === undefined ? (current?.classroomId ?? null) : input.classroomId,
      };
      const resources = await this.validateResources(institutionId, ids, transaction, true);
      const schedule = ids.scheduleId
        ? await this.requireInstitutionSchedule(institutionId, ids.scheduleId, transaction)
        : null;
      if (resources.classroom) {
        await this.assertClassroomAvailable(
          institutionId,
          sessionId,
          session.startsAt,
          session.endsAt,
          resources.classroom,
          transaction,
        );
      }
      await this.sessions.advanceResourceRevision(
        institutionId,
        sessionId,
        input.expectedRevision,
        transaction,
      );
      const row = await this.repository.saveSessionContext(
        {
          sessionId,
          institutionId,
          scheduleId: schedule?.id ?? null,
          scheduleNameSnapshot: schedule?.name ?? null,
          courseId: resources.course?.id ?? null,
          courseNameSnapshot: resources.course?.name ?? null,
          classGroupId: resources.classGroup?.id ?? null,
          classGroupNameSnapshot: resources.classGroup?.name ?? null,
          campusId: resources.campus?.id ?? null,
          campusNameSnapshot: resources.campus?.name ?? null,
          classroomId: resources.classroom?.id ?? null,
          classroomNameSnapshot: resources.classroom?.name ?? null,
        },
        transaction,
      );
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-session.resources-updated',
          resourceType: 'lesson-session',
          resourceId: sessionId,
          metadata: { institutionId, ...ids },
        },
        transaction,
      );
      return this.sessionContextView(row);
    });
  }

  private async validateResources(
    institutionId: string,
    input: {
      courseId?: string | null;
      classGroupId?: string | null;
      campusId?: string | null;
      classroomId?: string | null;
    },
    executor: DatabaseExecutor,
    requireActive = true,
  ) {
    const course = input.courseId
      ? await this.requireInstitutionCourse(institutionId, input.courseId, executor)
      : null;
    const classGroup = input.classGroupId
      ? await this.requireInstitutionClass(institutionId, input.classGroupId, executor)
      : null;
    const campus = input.campusId ? await this.requireCampus(input.campusId, executor) : null;
    const classroom = input.classroomId
      ? await this.requireClassroom(input.classroomId, executor)
      : null;
    if (classroom && (!campus || classroom.campusId !== campus.id)) {
      throw new ApiError(409, 'CLASSROOM_CAMPUS_MISMATCH', '教室不属于所选校区');
    }
    if (requireActive) {
      if (course && course.status !== 'active')
        throw new ApiError(409, 'COURSE_INACTIVE', '课程尚未启用或已停用');
      if (classGroup && !['recruiting', 'active'].includes(classGroup.status))
        throw new ApiError(409, 'CLASS_INACTIVE', '班级不可用于新课次');
      if (campus && campus.status !== 'active')
        throw new ApiError(409, 'CAMPUS_INACTIVE', '校区已停用');
      if (classroom && classroom.status !== 'active')
        throw new ApiError(409, 'CLASSROOM_INACTIVE', '教室已停用');
    }
    return { course, classGroup, campus, classroom };
  }

  private detectConflicts(
    occurrences: ReturnType<typeof enumerateLocalOccurrences>,
    overlaps: Awaited<ReturnType<LessonSessionSchedulingPort['listSchedulingOverlaps']>>,
    contexts: Map<string, SessionResourceContextRecord>,
    teachers: Array<{ id: string; fullName: string }>,
    classroom: ClassroomRecord | null,
  ): ScheduleConflict[] {
    const result: ScheduleConflict[] = [];
    const seen = new Set<string>();
    for (const occurrence of occurrences) {
      for (const overlap of overlaps) {
        if (overlap.startsAt >= occurrence.endsAt || overlap.endsAt <= occurrence.startsAt)
          continue;
        for (const teacher of teachers) {
          if (!overlap.teacherIds.includes(teacher.id)) continue;
          const key = `${occurrence.localDate}:teacher:${teacher.id}:${overlap.sessionId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({
            resourceType: 'teacher',
            resourceId: teacher.id,
            name: teacher.fullName,
            date: occurrence.localDate,
            existingSessionId: overlap.sessionId,
            existingSessionName: overlap.name,
          });
        }
        if (classroom && contexts.get(overlap.sessionId)?.classroomId === classroom.id) {
          const key = `${occurrence.localDate}:classroom:${classroom.id}:${overlap.sessionId}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({
              resourceType: 'classroom',
              resourceId: classroom.id,
              name: classroom.name,
              date: occurrence.localDate,
              existingSessionId: overlap.sessionId,
              existingSessionName: overlap.name,
            });
          }
        }
      }
    }
    return result;
  }

  private async assertClassroomAvailable(
    institutionId: string,
    sessionId: string,
    startsAt: Date,
    endsAt: Date,
    classroom: ClassroomRecord,
    transaction: DatabaseTransaction,
  ) {
    const overlaps = await this.sessions.listSchedulingOverlaps(
      institutionId,
      endsAt,
      startsAt,
      transaction,
    );
    const otherSessions = overlaps.filter((item) => item.sessionId !== sessionId);
    const contexts = await this.repository.listContexts(
      otherSessions.map((item) => item.sessionId),
      transaction,
    );
    const conflictingSessionIds = new Set(
      contexts.filter((item) => item.classroomId === classroom.id).map((item) => item.sessionId),
    );
    const conflicts = otherSessions
      .filter((item) => conflictingSessionIds.has(item.sessionId))
      .map((item) => ({
        resourceType: 'classroom' as const,
        resourceId: classroom.id,
        name: classroom.name,
        existingSessionId: item.sessionId,
        existingSessionName: item.name,
      }));
    if (conflicts.length > 0) {
      throw new ApiError(
        409,
        'LESSON_SESSION_CLASSROOM_CONFLICT',
        '教室与其他进行中或待上课课次时间冲突',
        { conflicts },
      );
    }
  }

  private async mutate<T>(
    action: string,
    resourceType: string,
    context: AuditContext,
    work: (transaction: DatabaseTransaction) => Promise<{ id: string; value: T }>,
  ): Promise<T> {
    try {
      return await this.database.transaction(async (transaction) => {
        const result = await work(transaction);
        await this.audit.record(
          { ...context, category: 'business', action, resourceType, resourceId: result.id },
          transaction,
        );
        return result.value;
      });
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ApiError(409, 'TEACHING_RESOURCE_EXISTS', '名称或编码已存在');
      throw error;
    }
  }

  private async requireCampus(id: string, executor?: DatabaseExecutor) {
    const row = await this.repository.findCampus(id, executor);
    if (!row) throw this.notFound('CAMPUS_NOT_FOUND', '校区不存在');
    return row;
  }

  private async requireActiveCampus(id: string, executor?: DatabaseExecutor) {
    const row = await this.requireCampus(id, executor);
    if (row.status !== 'active') throw new ApiError(409, 'CAMPUS_INACTIVE', '校区已停用');
    return row;
  }

  private async requireClassroom(id: string, executor?: DatabaseExecutor) {
    const row = await this.repository.findClassroom(id, executor);
    if (!row) throw this.notFound('CLASSROOM_NOT_FOUND', '教室不存在');
    return row;
  }

  private async requireInstitutionCourse(
    institutionId: string,
    id: string,
    executor?: DatabaseExecutor,
  ) {
    const row = await this.repository.findCourse(id, executor);
    if (!row || row.institutionId !== institutionId)
      throw this.notFound('COURSE_NOT_FOUND', '课程不存在或不属于当前机构');
    return row;
  }

  private async requireInstitutionClass(
    institutionId: string,
    id: string,
    executor?: DatabaseExecutor,
  ) {
    const row = await this.repository.findClassGroup(id, executor);
    if (!row || row.institutionId !== institutionId)
      throw this.notFound('CLASS_NOT_FOUND', '班级不存在或不属于当前机构');
    return row;
  }

  private async requireInstitutionSchedule(
    institutionId: string,
    id: string,
    executor?: DatabaseExecutor,
  ) {
    const row = await this.repository.findSchedule(id, executor);
    if (!row || row.institutionId !== institutionId)
      throw this.notFound('SCHEDULE_NOT_FOUND', '排课不存在或不属于当前机构');
    return row;
  }

  private assertRevision(actual: number, expected: number, resource: string) {
    if (actual !== expected) throw this.versionConflict(resource);
  }

  private versionConflict(resource: string) {
    return new ApiError(409, 'TEACHING_RESOURCE_VERSION_CONFLICT', `${resource}已被其他操作更新`);
  }

  private notFound(code: string, message: string) {
    return new ApiError(404, code, message);
  }

  private isUniqueViolation(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
      const value = current as { code?: string; cause?: unknown };
      if (value.code === '23505') return true;
      current = value.cause;
    }
    return false;
  }

  private translateRecurrenceError(error: unknown): never {
    const message = error instanceof Error ? error.message : '';
    if (message === 'SCHEDULE_GENERATION_RANGE_TOO_LARGE')
      throw new ApiError(400, message, '单次生成范围不能超过 366 日');
    if (message === 'SCHEDULE_GENERATION_COUNT_TOO_LARGE')
      throw new ApiError(400, message, '单次最多生成 200 个课次');
    if (message === 'SCHEDULE_LOCAL_TIME_INVALID')
      throw new ApiError(400, message, '本地上课时间在所选时区无效');
    throw new ApiError(400, 'SCHEDULE_RECURRENCE_INVALID', '排课重复规则无效');
  }

  private campusView(row: CampusRecord): Campus {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private classroomView(row: ClassroomRecord): Classroom {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private courseView(row: CourseRecord): Course {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private classGroupView(row: ClassGroupRecord): ClassGroup {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private membershipView(row: ClassMembershipRecord): ClassMembership {
    return {
      classGroupId: row.classGroupId,
      institutionId: row.institutionId,
      studentId: row.studentId,
      studentNameSnapshot: row.studentNameSnapshot,
      status: row.status,
      joinedAt: row.joinedAt.toISOString(),
      leftAt: row.leftAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private scheduleView(row: ScheduleRecord): Schedule {
    return {
      ...row,
      startTime: row.startTime.slice(0, 5),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private scheduleTeacherView(row: ScheduleTeacherRecord): ScheduleTeacherAssignment {
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private sessionContextView(row: SessionResourceContextRecord): SessionResourceContext {
    return {
      sessionId: row.sessionId,
      institutionId: row.institutionId,
      scheduleId: row.scheduleId,
      scheduleName: row.scheduleNameSnapshot,
      courseId: row.courseId,
      courseName: row.courseNameSnapshot,
      classGroupId: row.classGroupId,
      classGroupName: row.classGroupNameSnapshot,
      campusId: row.campusId,
      campusName: row.campusNameSnapshot,
      classroomId: row.classroomId,
      classroomName: row.classroomNameSnapshot,
    };
  }
}

function maxDate(left: string, right: string) {
  return left >= right ? left : right;
}

function minDate(left: string, right: string) {
  return left <= right ? left : right;
}
