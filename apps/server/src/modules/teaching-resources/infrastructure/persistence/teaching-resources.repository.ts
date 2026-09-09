import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, type SQL } from 'drizzle-orm';
import type {
  CampusListQuery,
  ClassGroupListQuery,
  ClassroomListQuery,
  CourseListQuery,
  CreateCampusRequest,
  CreateClassGroupRequest,
  CreateClassroomRequest,
  CreateCourseRequest,
  CreateScheduleRequest,
  ScheduleListQuery,
  ScheduleTeacherRole,
  UpdateCampusRequest,
  UpdateClassGroupRequest,
  UpdateClassroomRequest,
  UpdateCourseRequest,
  UpdateScheduleRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  teachingResourceCampuses,
  teachingResourceClassGroups,
  teachingResourceClassMemberships,
  teachingResourceClassrooms,
  teachingResourceCourses,
  teachingResourceScheduleOccurrences,
  teachingResourceSchedules,
  teachingResourceScheduleTeachers,
  teachingSessionResourceContexts,
} from './teaching-resources.schema.js';

export type CampusRecord = typeof teachingResourceCampuses.$inferSelect;
export type ClassroomRecord = typeof teachingResourceClassrooms.$inferSelect;
export type CourseRecord = typeof teachingResourceCourses.$inferSelect;
export type ClassGroupRecord = typeof teachingResourceClassGroups.$inferSelect;
export type ClassMembershipRecord = typeof teachingResourceClassMemberships.$inferSelect;
export type ScheduleRecord = typeof teachingResourceSchedules.$inferSelect;
export type ScheduleTeacherRecord = typeof teachingResourceScheduleTeachers.$inferSelect;
export type SessionResourceContextRecord = typeof teachingSessionResourceContexts.$inferSelect;

export class TeachingResourcesRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async listCampuses(input: CampusListQuery) {
    const filters: SQL[] = [];
    if (input.search) {
      filters.push(
        or(
          ilike(teachingResourceCampuses.name, `%${input.search}%`),
          ilike(teachingResourceCampuses.code, `%${input.search}%`),
        )!,
      );
    }
    if (input.status) filters.push(eq(teachingResourceCampuses.status, input.status));
    const where = filters.length ? and(...filters) : undefined;
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(teachingResourceCampuses)
        .where(where)
        .orderBy(asc(teachingResourceCampuses.name), asc(teachingResourceCampuses.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(teachingResourceCampuses).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findCampus(id: string, executor: DatabaseExecutor = this.database.db) {
    const [row] = await executor
      .select()
      .from(teachingResourceCampuses)
      .where(eq(teachingResourceCampuses.id, id))
      .limit(1);
    return row ?? null;
  }

  async createCampus(input: CreateCampusRequest, executor: DatabaseTransaction) {
    const [row] = await executor.insert(teachingResourceCampuses).values(input).returning();
    return row!;
  }

  async updateCampus(id: string, input: UpdateCampusRequest, executor: DatabaseTransaction) {
    const { expectedRevision, ...changes } = input;
    const [row] = await executor
      .update(teachingResourceCampuses)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(teachingResourceCampuses.id, id),
          eq(teachingResourceCampuses.revision, expectedRevision),
        ),
      )
      .returning();
    return row ?? null;
  }

  async listClassrooms(campusId: string, input: ClassroomListQuery) {
    const filters: SQL[] = [eq(teachingResourceClassrooms.campusId, campusId)];
    if (input.search) {
      filters.push(
        or(
          ilike(teachingResourceClassrooms.name, `%${input.search}%`),
          ilike(teachingResourceClassrooms.code, `%${input.search}%`),
        )!,
      );
    }
    if (input.status) filters.push(eq(teachingResourceClassrooms.status, input.status));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(teachingResourceClassrooms)
        .where(where)
        .orderBy(asc(teachingResourceClassrooms.name), asc(teachingResourceClassrooms.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(teachingResourceClassrooms).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findClassroom(id: string, executor: DatabaseExecutor = this.database.db) {
    const [row] = await executor
      .select()
      .from(teachingResourceClassrooms)
      .where(eq(teachingResourceClassrooms.id, id))
      .limit(1);
    return row ?? null;
  }

  async createClassroom(
    campusId: string,
    input: CreateClassroomRequest,
    executor: DatabaseTransaction,
  ) {
    const [row] = await executor
      .insert(teachingResourceClassrooms)
      .values({ ...input, campusId })
      .returning();
    return row!;
  }

  async updateClassroom(
    campusId: string,
    id: string,
    input: UpdateClassroomRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [row] = await executor
      .update(teachingResourceClassrooms)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(teachingResourceClassrooms.id, id),
          eq(teachingResourceClassrooms.campusId, campusId),
          eq(teachingResourceClassrooms.revision, expectedRevision),
        ),
      )
      .returning();
    return row ?? null;
  }

  async listCourses(institutionId: string, input: CourseListQuery) {
    const filters: SQL[] = [eq(teachingResourceCourses.institutionId, institutionId)];
    if (input.search) {
      filters.push(
        or(
          ilike(teachingResourceCourses.name, `%${input.search}%`),
          ilike(teachingResourceCourses.code, `%${input.search}%`),
        )!,
      );
    }
    if (input.status) filters.push(eq(teachingResourceCourses.status, input.status));
    if (input.category) filters.push(eq(teachingResourceCourses.category, input.category));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(teachingResourceCourses)
        .where(where)
        .orderBy(asc(teachingResourceCourses.sortOrder), asc(teachingResourceCourses.name))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(teachingResourceCourses).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findCourse(id: string, executor: DatabaseExecutor = this.database.db) {
    const [row] = await executor
      .select()
      .from(teachingResourceCourses)
      .where(eq(teachingResourceCourses.id, id))
      .limit(1);
    return row ?? null;
  }

  async createCourse(
    institutionId: string,
    input: CreateCourseRequest,
    executor: DatabaseTransaction,
  ) {
    const [row] = await executor
      .insert(teachingResourceCourses)
      .values({ ...input, institutionId })
      .returning();
    return row!;
  }

  async updateCourse(
    institutionId: string,
    id: string,
    input: UpdateCourseRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [row] = await executor
      .update(teachingResourceCourses)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(teachingResourceCourses.id, id),
          eq(teachingResourceCourses.institutionId, institutionId),
          eq(teachingResourceCourses.revision, expectedRevision),
        ),
      )
      .returning();
    return row ?? null;
  }

  async listClassGroups(institutionId: string, input: ClassGroupListQuery) {
    const filters: SQL[] = [eq(teachingResourceClassGroups.institutionId, institutionId)];
    if (input.search) filters.push(ilike(teachingResourceClassGroups.name, `%${input.search}%`));
    if (input.status) filters.push(eq(teachingResourceClassGroups.status, input.status));
    if (input.courseId) filters.push(eq(teachingResourceClassGroups.courseId, input.courseId));
    if (input.campusId) filters.push(eq(teachingResourceClassGroups.campusId, input.campusId));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(teachingResourceClassGroups)
        .where(where)
        .orderBy(asc(teachingResourceClassGroups.name), asc(teachingResourceClassGroups.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(teachingResourceClassGroups).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findClassGroup(id: string, executor: DatabaseExecutor = this.database.db) {
    const [row] = await executor
      .select()
      .from(teachingResourceClassGroups)
      .where(eq(teachingResourceClassGroups.id, id))
      .limit(1);
    return row ?? null;
  }

  async findClassGroupForUpdate(institutionId: string, id: string, executor: DatabaseTransaction) {
    const [row] = await executor
      .select()
      .from(teachingResourceClassGroups)
      .where(
        and(
          eq(teachingResourceClassGroups.id, id),
          eq(teachingResourceClassGroups.institutionId, institutionId),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async createClassGroup(
    institutionId: string,
    input: CreateClassGroupRequest,
    executor: DatabaseTransaction,
  ) {
    const [row] = await executor
      .insert(teachingResourceClassGroups)
      .values({ ...input, institutionId })
      .returning();
    return row!;
  }

  async updateClassGroup(
    institutionId: string,
    id: string,
    input: UpdateClassGroupRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [row] = await executor
      .update(teachingResourceClassGroups)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(teachingResourceClassGroups.id, id),
          eq(teachingResourceClassGroups.institutionId, institutionId),
          eq(teachingResourceClassGroups.revision, expectedRevision),
        ),
      )
      .returning();
    return row ?? null;
  }

  async listClassMemberships(
    classGroupId: string,
    page = 1,
    pageSize = 20,
    activeOnly = false,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const filters = [eq(teachingResourceClassMemberships.classGroupId, classGroupId)];
    if (activeOnly) filters.push(eq(teachingResourceClassMemberships.status, 'active'));
    const where = and(...filters);
    const [items, total] = await Promise.all([
      executor
        .select()
        .from(teachingResourceClassMemberships)
        .where(where)
        .orderBy(asc(teachingResourceClassMemberships.studentNameSnapshot))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      executor.select({ value: count() }).from(teachingResourceClassMemberships).where(where),
    ]);
    return { items, total: total[0]?.value ?? 0 };
  }

  async replaceClassMemberships(
    classGroup: ClassGroupRecord,
    students: Array<{ id: string; fullName: string }>,
    executor: DatabaseTransaction,
  ) {
    const selected = new Set(students.map((student) => student.id));
    const existing = await executor
      .select()
      .from(teachingResourceClassMemberships)
      .where(eq(teachingResourceClassMemberships.classGroupId, classGroup.id));
    const now = new Date();
    for (const membership of existing) {
      const isActive = selected.has(membership.studentId);
      await executor
        .update(teachingResourceClassMemberships)
        .set({
          status: isActive ? 'active' : 'inactive',
          leftAt: isActive ? null : (membership.leftAt ?? now),
          revision: membership.revision + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(teachingResourceClassMemberships.classGroupId, membership.classGroupId),
            eq(teachingResourceClassMemberships.studentId, membership.studentId),
          ),
        );
      selected.delete(membership.studentId);
    }
    const added = students.filter((student) => selected.has(student.id));
    if (added.length > 0) {
      await executor.insert(teachingResourceClassMemberships).values(
        added.map((student) => ({
          classGroupId: classGroup.id,
          institutionId: classGroup.institutionId,
          studentId: student.id,
          studentNameSnapshot: student.fullName,
        })),
      );
    }
    const [updatedClass] = await executor
      .update(teachingResourceClassGroups)
      .set({ revision: classGroup.revision + 1, updatedAt: now })
      .where(
        and(
          eq(teachingResourceClassGroups.id, classGroup.id),
          eq(teachingResourceClassGroups.revision, classGroup.revision),
        ),
      )
      .returning();
    return {
      classGroup: updatedClass ?? null,
      items: (await this.listClassMemberships(classGroup.id, 1, 500, false, executor)).items,
    };
  }

  async listSchedules(institutionId: string, input: ScheduleListQuery) {
    const filters: SQL[] = [eq(teachingResourceSchedules.institutionId, institutionId)];
    if (input.search) {
      filters.push(
        or(
          ilike(teachingResourceSchedules.name, `%${input.search}%`),
          ilike(teachingResourceSchedules.sessionName, `%${input.search}%`),
        )!,
      );
    }
    if (input.status) filters.push(eq(teachingResourceSchedules.status, input.status));
    if (input.courseId) filters.push(eq(teachingResourceSchedules.courseId, input.courseId));
    if (input.classGroupId)
      filters.push(eq(teachingResourceSchedules.classGroupId, input.classGroupId));
    if (input.campusId) filters.push(eq(teachingResourceSchedules.campusId, input.campusId));
    if (input.fromDate) filters.push(gte(teachingResourceSchedules.endDate, input.fromDate));
    if (input.toDate) filters.push(lte(teachingResourceSchedules.startDate, input.toDate));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(teachingResourceSchedules)
        .where(where)
        .orderBy(desc(teachingResourceSchedules.startDate), asc(teachingResourceSchedules.name))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(teachingResourceSchedules).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findSchedule(id: string, executor: DatabaseExecutor = this.database.db) {
    const [row] = await executor
      .select()
      .from(teachingResourceSchedules)
      .where(eq(teachingResourceSchedules.id, id))
      .limit(1);
    return row ?? null;
  }

  async findScheduleForUpdate(institutionId: string, id: string, executor: DatabaseTransaction) {
    const [row] = await executor
      .select()
      .from(teachingResourceSchedules)
      .where(
        and(
          eq(teachingResourceSchedules.id, id),
          eq(teachingResourceSchedules.institutionId, institutionId),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async createSchedule(
    institutionId: string,
    input: CreateScheduleRequest,
    executor: DatabaseTransaction,
  ) {
    const [row] = await executor
      .insert(teachingResourceSchedules)
      .values({ ...input, institutionId, startTime: `${input.startTime}:00` })
      .returning();
    return row!;
  }

  async updateSchedule(
    institutionId: string,
    id: string,
    input: UpdateScheduleRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [row] = await executor
      .update(teachingResourceSchedules)
      .set({
        ...changes,
        startTime: changes.startTime ? `${changes.startTime}:00` : undefined,
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(teachingResourceSchedules.id, id),
          eq(teachingResourceSchedules.institutionId, institutionId),
          eq(teachingResourceSchedules.revision, expectedRevision),
        ),
      )
      .returning();
    return row ?? null;
  }

  async listScheduleTeachers(scheduleId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(teachingResourceScheduleTeachers)
      .where(eq(teachingResourceScheduleTeachers.scheduleId, scheduleId))
      .orderBy(
        asc(teachingResourceScheduleTeachers.role),
        asc(teachingResourceScheduleTeachers.createdAt),
      );
  }

  async replaceScheduleTeachers(
    schedule: ScheduleRecord,
    teachers: Array<{ id: string; fullName: string; role: ScheduleTeacherRole }>,
    executor: DatabaseTransaction,
  ) {
    await executor
      .delete(teachingResourceScheduleTeachers)
      .where(eq(teachingResourceScheduleTeachers.scheduleId, schedule.id));
    const rows = teachers.length
      ? await executor
          .insert(teachingResourceScheduleTeachers)
          .values(
            teachers.map((teacher) => ({
              scheduleId: schedule.id,
              institutionId: schedule.institutionId,
              teacherId: teacher.id,
              teacherNameSnapshot: teacher.fullName,
              role: teacher.role,
            })),
          )
          .returning()
      : [];
    const [updatedSchedule] = await executor
      .update(teachingResourceSchedules)
      .set({ revision: schedule.revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(teachingResourceSchedules.id, schedule.id),
          eq(teachingResourceSchedules.revision, schedule.revision),
        ),
      )
      .returning();
    return { schedule: updatedSchedule ?? null, rows };
  }

  async existingOccurrenceDates(scheduleId: string, dates: string[], executor: DatabaseExecutor) {
    if (dates.length === 0) return [];
    return executor
      .select({ localDate: teachingResourceScheduleOccurrences.localDate })
      .from(teachingResourceScheduleOccurrences)
      .where(
        and(
          eq(teachingResourceScheduleOccurrences.scheduleId, scheduleId),
          inArray(teachingResourceScheduleOccurrences.localDate, dates),
        ),
      );
  }

  async listContexts(sessionIds: string[], executor: DatabaseExecutor) {
    if (sessionIds.length === 0) return [];
    return executor
      .select()
      .from(teachingSessionResourceContexts)
      .where(inArray(teachingSessionResourceContexts.sessionId, sessionIds));
  }

  async findSessionContext(
    institutionId: string,
    sessionId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [row] = await executor
      .select()
      .from(teachingSessionResourceContexts)
      .where(
        and(
          eq(teachingSessionResourceContexts.sessionId, sessionId),
          eq(teachingSessionResourceContexts.institutionId, institutionId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async saveSessionContext(
    values: typeof teachingSessionResourceContexts.$inferInsert,
    executor: DatabaseTransaction,
  ) {
    const [row] = await executor
      .insert(teachingSessionResourceContexts)
      .values(values)
      .onConflictDoUpdate({
        target: teachingSessionResourceContexts.sessionId,
        set: {
          scheduleId: values.scheduleId,
          scheduleNameSnapshot: values.scheduleNameSnapshot,
          courseId: values.courseId,
          courseNameSnapshot: values.courseNameSnapshot,
          classGroupId: values.classGroupId,
          classGroupNameSnapshot: values.classGroupNameSnapshot,
          campusId: values.campusId,
          campusNameSnapshot: values.campusNameSnapshot,
          classroomId: values.classroomId,
          classroomNameSnapshot: values.classroomNameSnapshot,
        },
      })
      .returning();
    return row!;
  }

  async addOccurrence(
    input: {
      scheduleId: string;
      institutionId: string;
      localDate: string;
      sessionId: string;
      generatedBy: string;
      overrideReason: string | null;
    },
    executor: DatabaseTransaction,
  ) {
    await executor.insert(teachingResourceScheduleOccurrences).values(input);
  }
}
