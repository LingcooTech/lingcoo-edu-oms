import { and, asc, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type {
  BindExistingGuardianRequest,
  CreateGuardianAndBindRequest,
  CreateStudentRequest,
  CreateTeacherRequest,
  EducationDataScope,
  StudentListQuery,
  UpdateGuardianBindingRequest,
  VerifyGuardianBindingRequest,
  UpdateStudentInstitutionRequest,
  UpdateStudentRequest,
  UpdateTeacherRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  peopleGuardians,
  peopleStudentGuardians,
  peopleStudentInstitutions,
  peopleStudents,
  peopleTeacherInstitutions,
  peopleTeachers,
} from './people.schema.js';

export type StudentRecord = typeof peopleStudents.$inferSelect;
export type StudentInstitutionRecord = typeof peopleStudentInstitutions.$inferSelect;
export type InstitutionStudentRecord = StudentRecord & {
  institutionId: StudentInstitutionRecord['institutionId'];
  relationshipStatus: StudentInstitutionRecord['status'];
  relationshipRevision: StudentInstitutionRecord['revision'];
  relationshipSource: StudentInstitutionRecord['source'];
  relationshipSourceReference: StudentInstitutionRecord['sourceReference'];
  joinedAt: StudentInstitutionRecord['joinedAt'];
  endedAt: StudentInstitutionRecord['endedAt'];
};
export type GuardianRecord = typeof peopleGuardians.$inferSelect;
export type GuardianBindingRecord = typeof peopleStudentGuardians.$inferSelect;
export type TeacherRecord = typeof peopleTeachers.$inferSelect;
export type TeacherInstitutionRecord = typeof peopleTeacherInstitutions.$inferSelect;

const studentSelection = {
  id: peopleStudents.id,
  fullName: peopleStudents.fullName,
  preferredName: peopleStudents.preferredName,
  grade: peopleStudents.grade,
  school: peopleStudents.school,
  gender: peopleStudents.gender,
  birthDate: peopleStudents.birthDate,
  notes: peopleStudents.notes,
  status: peopleStudents.status,
  revision: peopleStudents.revision,
  createdAt: peopleStudents.createdAt,
  updatedAt: peopleStudents.updatedAt,
  institutionId: peopleStudentInstitutions.institutionId,
  relationshipStatus: peopleStudentInstitutions.status,
  relationshipRevision: peopleStudentInstitutions.revision,
  relationshipSource: peopleStudentInstitutions.source,
  relationshipSourceReference: peopleStudentInstitutions.sourceReference,
  joinedAt: peopleStudentInstitutions.joinedAt,
  endedAt: peopleStudentInstitutions.endedAt,
};

export class PeopleRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async listStudents(input: StudentListQuery, scope: EducationDataScope) {
    if (scope.kind === 'teacher') return { items: [], total: 0 };
    const filters = this.studentFilters(input, scope);
    const base = this.database.db
      .select(studentSelection)
      .from(peopleStudentInstitutions)
      .innerJoin(peopleStudents, eq(peopleStudents.id, peopleStudentInstitutions.studentId));
    const countBase = this.database.db
      .select({ value: count() })
      .from(peopleStudentInstitutions)
      .innerJoin(peopleStudents, eq(peopleStudents.id, peopleStudentInstitutions.studentId));
    const joined =
      scope.kind === 'guardian'
        ? base.innerJoin(
            peopleStudentGuardians,
            and(
              eq(peopleStudentGuardians.studentId, peopleStudents.id),
              eq(peopleStudentGuardians.guardianId, scope.guardianId),
              eq(peopleStudentGuardians.status, 'active'),
              eq(peopleStudentGuardians.verificationStatus, 'verified'),
            ),
          )
        : base;
    const countJoined =
      scope.kind === 'guardian'
        ? countBase.innerJoin(
            peopleStudentGuardians,
            and(
              eq(peopleStudentGuardians.studentId, peopleStudents.id),
              eq(peopleStudentGuardians.guardianId, scope.guardianId),
              eq(peopleStudentGuardians.status, 'active'),
              eq(peopleStudentGuardians.verificationStatus, 'verified'),
            ),
          )
        : countBase;
    const [items, total] = await Promise.all([
      joined
        .where(and(...filters))
        .orderBy(asc(peopleStudents.fullName), asc(peopleStudents.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      countJoined.where(and(...filters)),
    ]);
    return { items, total: total[0]?.value ?? 0 };
  }

  async findStudent(studentId: string, scope: EducationDataScope, executor: DatabaseExecutor) {
    if (scope.kind === 'teacher') return null;
    const filters: SQL[] = [
      eq(peopleStudents.id, studentId),
      eq(peopleStudentInstitutions.institutionId, scope.institutionId),
    ];
    const base = executor
      .select(studentSelection)
      .from(peopleStudentInstitutions)
      .innerJoin(peopleStudents, eq(peopleStudents.id, peopleStudentInstitutions.studentId));
    const query =
      scope.kind === 'guardian'
        ? base.innerJoin(
            peopleStudentGuardians,
            and(
              eq(peopleStudentGuardians.studentId, peopleStudents.id),
              eq(peopleStudentGuardians.guardianId, scope.guardianId),
              eq(peopleStudentGuardians.status, 'active'),
            ),
          )
        : base;
    const [record] = await query.where(and(...filters)).limit(1);
    return record ?? null;
  }

  async createStudent(
    institutionId: string,
    input: CreateStudentRequest,
    executor: DatabaseTransaction,
  ) {
    const [student] = await executor.insert(peopleStudents).values(input).returning();
    const [relationship] = await executor
      .insert(peopleStudentInstitutions)
      .values({ studentId: student!.id, institutionId })
      .returning();
    return { student: student!, relationship: relationship! };
  }

  async findStudentRecord(studentId: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(peopleStudents)
      .where(eq(peopleStudents.id, studentId))
      .limit(1);
    return record ?? null;
  }

  async findStudentInstitution(
    studentId: string,
    institutionId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select({ student: peopleStudents, relationship: peopleStudentInstitutions })
      .from(peopleStudentInstitutions)
      .innerJoin(peopleStudents, eq(peopleStudents.id, peopleStudentInstitutions.studentId))
      .where(
        and(
          eq(peopleStudentInstitutions.studentId, studentId),
          eq(peopleStudentInstitutions.institutionId, institutionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createStudentInstitution(
    studentId: string,
    institutionId: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(peopleStudentInstitutions)
      .values({ studentId, institutionId })
      .returning();
    return record!;
  }

  async updateStudent(
    studentId: string,
    input: UpdateStudentRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(peopleStudents)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(and(eq(peopleStudents.id, studentId), eq(peopleStudents.revision, expectedRevision)))
      .returning();
    return record ?? null;
  }

  async updateStudentInstitution(
    institutionId: string,
    studentId: string,
    input: UpdateStudentInstitutionRequest,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(peopleStudentInstitutions)
      .set({
        status: input.status,
        endedAt: input.status === 'inactive' ? now : null,
        revision: input.expectedRevision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(peopleStudentInstitutions.institutionId, institutionId),
          eq(peopleStudentInstitutions.studentId, studentId),
          eq(peopleStudentInstitutions.revision, input.expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async listGuardianBindings(studentId: string, executor: DatabaseExecutor) {
    return executor
      .select({ binding: peopleStudentGuardians, guardian: peopleGuardians })
      .from(peopleStudentGuardians)
      .innerJoin(peopleGuardians, eq(peopleGuardians.id, peopleStudentGuardians.guardianId))
      .where(eq(peopleStudentGuardians.studentId, studentId))
      .orderBy(asc(peopleStudentGuardians.createdAt));
  }

  async createGuardianAndBinding(
    studentId: string,
    input: CreateGuardianAndBindRequest,
    executor: DatabaseTransaction,
    verificationSource: 'admin' | 'wechat' = 'admin',
  ) {
    const { relationship, isPrimary, ...guardianInput } = input;
    const [guardian] = await executor.insert(peopleGuardians).values(guardianInput).returning();
    if (isPrimary) await this.clearPrimaryGuardian(studentId, executor);
    const [binding] = await executor
      .insert(peopleStudentGuardians)
      .values({
        studentId,
        guardianId: guardian!.id,
        relationship,
        isPrimary,
        verificationStatus: 'verified',
        verificationSource,
        verifiedAt: new Date(),
      })
      .returning();
    return { guardian: guardian!, binding: binding! };
  }

  async bindExistingGuardian(
    studentId: string,
    input: BindExistingGuardianRequest,
    executor: DatabaseTransaction,
    verificationSource: 'admin' | 'wechat' = 'admin',
  ) {
    if (input.isPrimary) await this.clearPrimaryGuardian(studentId, executor);
    const [binding] = await executor
      .insert(peopleStudentGuardians)
      .values({
        studentId,
        ...input,
        verificationStatus: 'verified',
        verificationSource,
        verifiedAt: new Date(),
      })
      .returning();
    return binding!;
  }

  async findGuardian(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(peopleGuardians)
      .where(eq(peopleGuardians.id, id))
      .limit(1);
    return record ?? null;
  }

  async findGuardianByIdentityUserId(
    identityUserId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(peopleGuardians)
      .where(eq(peopleGuardians.identityUserId, identityUserId))
      .limit(1);
    return record ?? null;
  }

  findGuardiansByPhone(phone: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(peopleGuardians)
      .where(eq(peopleGuardians.phone, phone))
      .orderBy(asc(peopleGuardians.createdAt), asc(peopleGuardians.id));
  }

  async linkGuardianIdentity(
    guardianId: string,
    identityUserId: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(peopleGuardians)
      .set({
        identityUserId,
        revision: sql`${peopleGuardians.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(peopleGuardians.id, guardianId), sql`${peopleGuardians.identityUserId} is null`),
      )
      .returning();
    return record ?? null;
  }

  async findGuardianBinding(id: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(peopleStudentGuardians)
      .where(eq(peopleStudentGuardians.id, id))
      .limit(1);
    return record ?? null;
  }

  async updateGuardianBinding(
    id: string,
    studentId: string,
    input: UpdateGuardianBindingRequest,
    executor: DatabaseTransaction,
  ) {
    if (input.isPrimary) await this.clearPrimaryGuardian(studentId, executor, id);
    const { expectedRevision, ...changes } = input;
    const now = new Date();
    const [record] = await executor
      .update(peopleStudentGuardians)
      .set({
        ...changes,
        revokedAt:
          changes.status === 'revoked' ? now : changes.status === 'active' ? null : undefined,
        revision: expectedRevision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(peopleStudentGuardians.id, id),
          eq(peopleStudentGuardians.studentId, studentId),
          eq(peopleStudentGuardians.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async verifyGuardianBinding(
    bindingId: string,
    studentId: string,
    input: VerifyGuardianBindingRequest,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(peopleStudentGuardians)
      .set({
        verificationStatus: 'verified',
        verificationSource: 'admin',
        verifiedAt: new Date(),
        revision: input.expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(peopleStudentGuardians.id, bindingId),
          eq(peopleStudentGuardians.studentId, studentId),
          eq(peopleStudentGuardians.status, 'active'),
          eq(peopleStudentGuardians.verificationStatus, 'unverified'),
          eq(peopleStudentGuardians.revision, input.expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async createTeacher(
    institutionId: string,
    input: CreateTeacherRequest,
    executor: DatabaseTransaction,
  ) {
    const [teacher] = await executor.insert(peopleTeachers).values(input).returning();
    const [relationship] = await executor
      .insert(peopleTeacherInstitutions)
      .values({ teacherId: teacher!.id, institutionId })
      .returning();
    return { teacher: teacher!, relationship: relationship! };
  }

  async updateTeacher(
    teacherId: string,
    input: UpdateTeacherRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, ...changes } = input;
    const [teacher] = await executor
      .update(peopleTeachers)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(and(eq(peopleTeachers.id, teacherId), eq(peopleTeachers.revision, expectedRevision)))
      .returning();
    return teacher ?? null;
  }

  async listTeachers(institutionId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select({ teacher: peopleTeachers, relationship: peopleTeacherInstitutions })
      .from(peopleTeacherInstitutions)
      .innerJoin(peopleTeachers, eq(peopleTeachers.id, peopleTeacherInstitutions.teacherId))
      .where(eq(peopleTeacherInstitutions.institutionId, institutionId))
      .orderBy(asc(peopleTeachers.fullName), asc(peopleTeachers.id));
  }

  async findTeacherWithInstitution(
    teacherId: string,
    institutionId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select({ teacher: peopleTeachers, relationship: peopleTeacherInstitutions })
      .from(peopleTeacherInstitutions)
      .innerJoin(peopleTeachers, eq(peopleTeachers.id, peopleTeacherInstitutions.teacherId))
      .where(
        and(
          eq(peopleTeacherInstitutions.teacherId, teacherId),
          eq(peopleTeacherInstitutions.institutionId, institutionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async guardianCanAccessInstitution(
    guardianId: string,
    institutionId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select({ studentId: peopleStudents.id })
      .from(peopleStudentGuardians)
      .innerJoin(peopleGuardians, eq(peopleGuardians.id, peopleStudentGuardians.guardianId))
      .innerJoin(peopleStudents, eq(peopleStudents.id, peopleStudentGuardians.studentId))
      .innerJoin(
        peopleStudentInstitutions,
        eq(peopleStudentInstitutions.studentId, peopleStudents.id),
      )
      .where(
        and(
          eq(peopleStudentGuardians.guardianId, guardianId),
          eq(peopleStudentGuardians.status, 'active'),
          eq(peopleStudentGuardians.verificationStatus, 'verified'),
          eq(peopleGuardians.status, 'active'),
          eq(peopleStudents.status, 'active'),
          eq(peopleStudentInstitutions.institutionId, institutionId),
          eq(peopleStudentInstitutions.status, 'active'),
        ),
      )
      .limit(1);
    return Boolean(record);
  }

  private studentFilters(input: StudentListQuery, scope: EducationDataScope): SQL[] {
    const filters: SQL[] = [eq(peopleStudentInstitutions.institutionId, scope.institutionId)];
    if (input.search) {
      const search = `%${input.search}%`;
      filters.push(
        or(ilike(peopleStudents.fullName, search), ilike(peopleStudents.preferredName, search))!,
      );
    }
    if (input.status) filters.push(eq(peopleStudents.status, input.status));
    if (input.relationshipStatus)
      filters.push(eq(peopleStudentInstitutions.status, input.relationshipStatus));
    return filters;
  }

  private async clearPrimaryGuardian(
    studentId: string,
    executor: DatabaseTransaction,
    exceptId?: string,
  ) {
    const filters: SQL[] = [
      eq(peopleStudentGuardians.studentId, studentId),
      eq(peopleStudentGuardians.isPrimary, true),
    ];
    if (exceptId) filters.push(sqlNotEqual(peopleStudentGuardians.id, exceptId));
    await executor
      .update(peopleStudentGuardians)
      .set({
        isPrimary: false,
        revision: sql`${peopleStudentGuardians.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(...filters));
  }
}

function sqlNotEqual(column: typeof peopleStudentGuardians.id, value: string): SQL {
  return sql`${column} <> ${value}`;
}
