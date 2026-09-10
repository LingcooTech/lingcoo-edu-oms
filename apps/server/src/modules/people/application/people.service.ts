import { ApiError } from '@lingcoo-tech/http';
import type {
  BindExistingGuardianRequest,
  CreateGuardianAndBindRequest,
  CreateStudentRequest,
  CreateStudentInstitutionRequest,
  CreateTeacherRequest,
  EducationAssignmentInput,
  EducationDataScope,
  GuardianBinding,
  InstitutionStudent,
  InstitutionTeacher,
  StudentListQuery,
  UpdateGuardianBindingRequest,
  UpdateStudentInstitutionRequest,
  UpdateStudentRequest,
  UpdateTeacherRequest,
  VerifyGuardianBindingRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { IdentityService } from '../../identity/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import {
  PeopleRepository,
  type GuardianBindingRecord,
  type GuardianRecord,
  type InstitutionStudentRecord,
  type TeacherInstitutionRecord,
  type TeacherRecord,
} from '../infrastructure/persistence/people.repository.js';

export interface EducationDirectory {
  validateAssignment(
    userId: string,
    assignment: EducationAssignmentInput,
    executor?: DatabaseExecutor,
  ): Promise<void>;
}

export interface StudentDirectory {
  assertActiveStudentInstitution(
    studentId: string,
    institutionId: string,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  assertStudentAccess(
    studentId: string,
    scope: EducationDataScope,
    executor?: DatabaseExecutor,
  ): Promise<void>;
  getActiveStudentSnapshot(
    studentId: string,
    institutionId: string,
    executor?: DatabaseExecutor,
  ): Promise<{ id: string; fullName: string }>;
}

export interface TeacherDirectory {
  getActiveTeacherSnapshot(
    teacherId: string,
    institutionId: string,
    executor?: DatabaseExecutor,
  ): Promise<{ id: string; fullName: string }>;
}

export interface StudentLessonAccountProvisioner {
  ensureForStudentInstitution(
    institutionId: string,
    studentId: string,
    context: AuditContext,
    transaction: DatabaseTransaction,
  ): Promise<void>;
}

export interface StudentOnboardingDirectory {
  onboardStudent(
    institutionId: string,
    student: CreateStudentRequest,
    guardian: CreateGuardianAndBindRequest,
    context: AuditContext,
  ): Promise<{ student: InstitutionStudent; guardian: GuardianBinding }>;
  onboardStudentInTransaction(
    institutionId: string,
    student: CreateStudentRequest,
    guardian: CreateGuardianAndBindRequest,
    context: AuditContext,
    transaction: DatabaseTransaction,
  ): Promise<{ student: InstitutionStudent; guardian: GuardianBinding }>;
}

export class PeopleService
  implements EducationDirectory, StudentDirectory, TeacherDirectory, StudentOnboardingDirectory
{
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: PeopleRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly identity: IdentityService,
    private readonly audit: AuditWriter,
    private readonly lessonAccounts: StudentLessonAccountProvisioner,
  ) {}

  async listStudents(input: StudentListQuery, scope: EducationDataScope) {
    const result = await this.repository.listStudents(input, scope);
    return {
      items: result.items.map((record) => this.studentView(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async getStudent(studentId: string, scope: EducationDataScope): Promise<InstitutionStudent> {
    const record = await this.repository.findStudent(studentId, scope, this.database.db);
    if (!record) throw new ApiError(404, 'STUDENT_NOT_FOUND', '学员不存在或不在当前数据范围');
    return this.studentView(record);
  }

  async createStudent(
    institutionId: string,
    input: CreateStudentRequest,
    context: AuditContext,
  ): Promise<InstitutionStudent> {
    return this.database.transaction(async (transaction) => {
      await this.institutions.assertActiveInstitution(institutionId, transaction);
      const created = await this.repository.createStudent(institutionId, input, transaction);
      await this.lessonAccounts.ensureForStudentInstitution(
        institutionId,
        created.student.id,
        context,
        transaction,
      );
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'student.created',
          resourceType: 'people.student',
          resourceId: created.student.id,
          changes: [
            { field: 'fullName', before: null, after: created.student.fullName },
            { field: 'institutionId', before: null, after: institutionId },
          ],
        },
        transaction,
      );
      return this.studentView({
        ...created.student,
        institutionId: created.relationship.institutionId,
        relationshipStatus: created.relationship.status,
        relationshipRevision: created.relationship.revision,
        relationshipSource: created.relationship.source,
        relationshipSourceReference: created.relationship.sourceReference,
        joinedAt: created.relationship.joinedAt,
        endedAt: created.relationship.endedAt,
      });
    });
  }

  async onboardStudent(
    institutionId: string,
    studentInput: CreateStudentRequest,
    guardianInput: CreateGuardianAndBindRequest,
    context: AuditContext,
  ): Promise<{ student: InstitutionStudent; guardian: GuardianBinding }> {
    return this.database.transaction((transaction) =>
      this.onboardStudentInTransaction(
        institutionId,
        studentInput,
        guardianInput,
        context,
        transaction,
      ),
    );
  }

  async onboardStudentInTransaction(
    institutionId: string,
    studentInput: CreateStudentRequest,
    guardianInput: CreateGuardianAndBindRequest,
    context: AuditContext,
    transaction: DatabaseTransaction,
  ): Promise<{ student: InstitutionStudent; guardian: GuardianBinding }> {
    await this.institutions.assertActiveInstitution(institutionId, transaction);
    const created = await this.repository.createStudent(institutionId, studentInput, transaction);
    await this.lessonAccounts.ensureForStudentInstitution(
      institutionId,
      created.student.id,
      context,
      transaction,
    );
    const guardianCreated = await this.repository.createGuardianAndBinding(
      created.student.id,
      guardianInput,
      transaction,
    );
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: 'student.onboarded',
        resourceType: 'people.student',
        resourceId: created.student.id,
        changes: [
          { field: 'institutionId', before: null, after: institutionId },
          { field: 'guardianId', before: null, after: guardianCreated.guardian.id },
        ],
      },
      transaction,
    );
    return {
      student: this.studentView({
        ...created.student,
        institutionId: created.relationship.institutionId,
        relationshipStatus: created.relationship.status,
        relationshipRevision: created.relationship.revision,
        relationshipSource: created.relationship.source,
        relationshipSourceReference: created.relationship.sourceReference,
        joinedAt: created.relationship.joinedAt,
        endedAt: created.relationship.endedAt,
      }),
      guardian: this.guardianBindingView(guardianCreated.binding, guardianCreated.guardian),
    };
  }

  async addStudentInstitution(
    institutionId: string,
    input: CreateStudentInstitutionRequest,
    context: AuditContext,
  ): Promise<InstitutionStudent> {
    try {
      return await this.database.transaction(async (transaction) => {
        await this.institutions.assertActiveInstitution(institutionId, transaction);
        const student = await this.repository.findStudentRecord(input.studentId, transaction);
        if (!student) throw new ApiError(404, 'STUDENT_NOT_FOUND', '学员不存在');
        const relationship = await this.repository.createStudentInstitution(
          student.id,
          institutionId,
          transaction,
        );
        await this.lessonAccounts.ensureForStudentInstitution(
          institutionId,
          student.id,
          context,
          transaction,
        );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'student.institution-added',
            resourceType: 'people.student-institution',
            resourceId: `${student.id}:${institutionId}`,
            changes: [{ field: 'institutionId', before: null, after: institutionId }],
          },
          transaction,
        );
        return this.studentView({
          ...student,
          institutionId,
          relationshipStatus: relationship.status,
          relationshipRevision: relationship.revision,
          relationshipSource: relationship.source,
          relationshipSourceReference: relationship.sourceReference,
          joinedAt: relationship.joinedAt,
          endedAt: relationship.endedAt,
        });
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ApiError(409, 'STUDENT_INSTITUTION_EXISTS', '学员已在该机构服务范围内');
      }
      throw error;
    }
  }

  async updateStudent(
    studentId: string,
    scope: EducationDataScope,
    input: UpdateStudentRequest,
    context: AuditContext,
  ): Promise<InstitutionStudent> {
    this.assertInstitutionWriteScope(scope);
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.findStudent(studentId, scope, transaction);
      if (!before) throw new ApiError(404, 'STUDENT_NOT_FOUND', '学员不存在或不在当前数据范围');
      const updated = await this.repository.updateStudent(studentId, input, transaction);
      if (!updated) throw new ApiError(409, 'STUDENT_VERSION_CONFLICT', '学员已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'student.updated',
          resourceType: 'people.student',
          resourceId: studentId,
          changes: Object.entries(input)
            .filter(([field]) => field !== 'expectedRevision')
            .map(([field, after]) => ({
              field,
              before: before[field as keyof typeof before] ?? null,
              after: after ?? null,
            })),
        },
        transaction,
      );
      return this.studentView({ ...before, ...updated });
    });
  }

  async updateStudentInstitution(
    studentId: string,
    scope: EducationDataScope,
    input: UpdateStudentInstitutionRequest,
    context: AuditContext,
  ): Promise<InstitutionStudent> {
    this.assertInstitutionWriteScope(scope);
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.findStudent(studentId, scope, transaction);
      if (!before) throw new ApiError(404, 'STUDENT_NOT_FOUND', '学员不存在或不在当前机构');
      const relationship = await this.repository.updateStudentInstitution(
        scope.institutionId,
        studentId,
        input,
        transaction,
      );
      if (!relationship) {
        throw new ApiError(409, 'STUDENT_RELATIONSHIP_VERSION_CONFLICT', '学员服务关系已更新');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'student.institution-status-updated',
          resourceType: 'people.student-institution',
          resourceId: `${studentId}:${scope.institutionId}`,
          changes: [
            { field: 'status', before: before.relationshipStatus, after: relationship.status },
          ],
        },
        transaction,
      );
      return this.studentView({
        ...before,
        relationshipStatus: relationship.status,
        relationshipRevision: relationship.revision,
        joinedAt: relationship.joinedAt,
        endedAt: relationship.endedAt,
      });
    });
  }

  async listGuardianBindings(
    studentId: string,
    scope: EducationDataScope,
  ): Promise<{ items: GuardianBinding[] }> {
    await this.assertStudentVisible(studentId, scope, this.database.db);
    const rows = await this.repository.listGuardianBindings(studentId, this.database.db);
    return { items: rows.map((row) => this.guardianBindingView(row.binding, row.guardian)) };
  }

  async createGuardianAndBind(
    studentId: string,
    scope: EducationDataScope,
    input: CreateGuardianAndBindRequest,
    context: AuditContext,
  ): Promise<GuardianBinding> {
    this.assertInstitutionWriteScope(scope);
    try {
      return await this.database.transaction(async (transaction) => {
        await this.assertStudentVisible(studentId, scope, transaction);
        if (input.identityUserId) await this.assertActiveIdentity(input.identityUserId);
        const created = await this.repository.createGuardianAndBinding(
          studentId,
          input,
          transaction,
        );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'guardian.bound',
            resourceType: 'people.student-guardian',
            resourceId: created.binding.id,
            changes: [
              { field: 'studentId', before: null, after: studentId },
              { field: 'guardianId', before: null, after: created.guardian.id },
              { field: 'relationship', before: null, after: created.binding.relationship },
            ],
          },
          transaction,
        );
        return this.guardianBindingView(created.binding, created.guardian);
      });
    } catch (error) {
      this.translateRelationshipConflict(error);
      throw error;
    }
  }

  async bindExistingGuardian(
    studentId: string,
    scope: EducationDataScope,
    input: BindExistingGuardianRequest,
    context: AuditContext,
  ): Promise<GuardianBinding> {
    this.assertInstitutionWriteScope(scope);
    try {
      return await this.database.transaction(async (transaction) => {
        await this.assertStudentVisible(studentId, scope, transaction);
        const guardian = await this.repository.findGuardian(input.guardianId, transaction);
        if (!guardian) throw new ApiError(404, 'GUARDIAN_NOT_FOUND', '监护人不存在');
        const binding = await this.repository.bindExistingGuardian(studentId, input, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'guardian.bound',
            resourceType: 'people.student-guardian',
            resourceId: binding.id,
            changes: [{ field: 'guardianId', before: null, after: guardian.id }],
          },
          transaction,
        );
        return this.guardianBindingView(binding, guardian);
      });
    } catch (error) {
      this.translateRelationshipConflict(error);
      throw error;
    }
  }

  async updateGuardianBinding(
    studentId: string,
    bindingId: string,
    scope: EducationDataScope,
    input: UpdateGuardianBindingRequest,
    context: AuditContext,
  ): Promise<GuardianBinding> {
    this.assertInstitutionWriteScope(scope);
    return this.database.transaction(async (transaction) => {
      await this.assertStudentVisible(studentId, scope, transaction);
      const before = await this.repository.findGuardianBinding(bindingId, transaction);
      if (!before || before.studentId !== studentId) {
        throw new ApiError(404, 'GUARDIAN_BINDING_NOT_FOUND', '监护人绑定不存在');
      }
      const updated = await this.repository.updateGuardianBinding(
        bindingId,
        studentId,
        input,
        transaction,
      );
      if (!updated) {
        throw new ApiError(409, 'GUARDIAN_BINDING_VERSION_CONFLICT', '监护人绑定已更新');
      }
      const guardian = await this.repository.findGuardian(updated.guardianId, transaction);
      if (!guardian) throw new ApiError(409, 'GUARDIAN_BINDING_INVALID', '监护人绑定无效');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: updated.status === 'revoked' ? 'guardian.unbound' : 'guardian.binding-updated',
          resourceType: 'people.student-guardian',
          resourceId: bindingId,
          changes: Object.entries(input)
            .filter(([field]) => field !== 'expectedRevision')
            .map(([field, after]) => ({
              field,
              before: before[field as keyof typeof before] ?? null,
              after: after ?? null,
            })),
        },
        transaction,
      );
      return this.guardianBindingView(updated, guardian);
    });
  }

  async verifyGuardianBinding(
    studentId: string,
    bindingId: string,
    scope: EducationDataScope,
    input: VerifyGuardianBindingRequest,
    context: AuditContext,
  ): Promise<GuardianBinding> {
    this.assertInstitutionWriteScope(scope);
    return this.database.transaction(async (transaction) => {
      await this.assertStudentVisible(studentId, scope, transaction);
      const before = await this.repository.findGuardianBinding(bindingId, transaction);
      if (!before || before.studentId !== studentId) {
        throw new ApiError(404, 'GUARDIAN_BINDING_NOT_FOUND', '监护人绑定不存在');
      }
      const updated = await this.repository.verifyGuardianBinding(
        bindingId,
        studentId,
        input,
        transaction,
      );
      if (!updated) {
        throw new ApiError(
          409,
          'GUARDIAN_VERIFICATION_CONFLICT',
          '绑定已核验、撤销或被其他操作更新',
        );
      }
      const guardian = await this.repository.findGuardian(updated.guardianId, transaction);
      if (!guardian) throw new ApiError(409, 'GUARDIAN_BINDING_INVALID', '监护人绑定无效');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'guardian.binding-verified',
          resourceType: 'people.student-guardian',
          resourceId: bindingId,
          changes: [
            {
              field: 'verificationStatus',
              before: before.verificationStatus,
              after: updated.verificationStatus,
            },
          ],
        },
        transaction,
      );
      return this.guardianBindingView(updated, guardian);
    });
  }

  async listTeachers(institutionId: string): Promise<{ items: InstitutionTeacher[] }> {
    const rows = await this.repository.listTeachers(institutionId);
    return { items: rows.map((row) => this.teacherView(row.teacher, row.relationship)) };
  }

  async createTeacher(
    institutionId: string,
    input: CreateTeacherRequest,
    context: AuditContext,
  ): Promise<InstitutionTeacher> {
    try {
      return await this.database.transaction(async (transaction) => {
        await this.institutions.assertActiveInstitution(institutionId, transaction);
        if (input.identityUserId) await this.assertActiveIdentity(input.identityUserId);
        const created = await this.repository.createTeacher(institutionId, input, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'teacher.created',
            resourceType: 'people.teacher',
            resourceId: created.teacher.id,
            changes: [
              { field: 'fullName', before: null, after: created.teacher.fullName },
              { field: 'institutionId', before: null, after: institutionId },
            ],
          },
          transaction,
        );
        return this.teacherView(created.teacher, created.relationship);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ApiError(409, 'TEACHER_IDENTITY_EXISTS', '该账号已关联教师档案');
      }
      throw error;
    }
  }

  async updateTeacher(
    institutionId: string,
    teacherId: string,
    input: UpdateTeacherRequest,
    context: AuditContext,
  ): Promise<InstitutionTeacher> {
    try {
      return await this.database.transaction(async (transaction) => {
        const before = await this.repository.findTeacherWithInstitution(
          teacherId,
          institutionId,
          transaction,
        );
        if (!before) throw new ApiError(404, 'TEACHER_NOT_FOUND', '教师档案不存在或不在当前机构');
        if (input.identityUserId) await this.assertActiveIdentity(input.identityUserId);
        const teacher = await this.repository.updateTeacher(teacherId, input, transaction);
        if (!teacher) {
          throw new ApiError(409, 'TEACHER_VERSION_CONFLICT', '教师档案已被其他操作更新');
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'teacher.updated',
            resourceType: 'people.teacher',
            resourceId: teacherId,
            changes: Object.entries(input)
              .filter(([field]) => field !== 'expectedRevision')
              .map(([field, after]) => ({
                field,
                before: before.teacher[field as keyof TeacherRecord] ?? null,
                after: after ?? null,
              })),
          },
          transaction,
        );
        return this.teacherView(teacher, before.relationship);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ApiError(409, 'TEACHER_IDENTITY_EXISTS', '该账号已关联教师档案');
      }
      throw error;
    }
  }

  async validateAssignment(
    userId: string,
    assignment: EducationAssignmentInput,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    await this.institutions.assertActiveInstitution(assignment.institutionId, executor);
    if (assignment.role === 'institution_admin') return;
    if (assignment.role === 'teacher') {
      const record = await this.repository.findTeacherWithInstitution(
        assignment.teacherId!,
        assignment.institutionId,
        executor,
      );
      if (
        !record ||
        record.teacher.status !== 'active' ||
        record.relationship.status !== 'active' ||
        record.teacher.identityUserId !== userId
      ) {
        throw new ApiError(422, 'ASSIGNMENT_TEACHER_INVALID', '教师档案、账号与机构任职关系不匹配');
      }
      return;
    }
    const guardian = await this.repository.findGuardian(assignment.guardianId!, executor);
    if (
      !guardian ||
      guardian.status !== 'active' ||
      guardian.identityUserId !== userId ||
      !(await this.repository.guardianCanAccessInstitution(
        assignment.guardianId!,
        assignment.institutionId,
        executor,
      ))
    ) {
      throw new ApiError(
        422,
        'ASSIGNMENT_GUARDIAN_INVALID',
        '监护人档案、账号与学员机构关系不匹配',
      );
    }
  }

  async assertActiveStudentInstitution(
    studentId: string,
    institutionId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    const record = await this.repository.findStudentInstitution(studentId, institutionId, executor);
    if (!record || record.student.status !== 'active' || record.relationship.status !== 'active') {
      throw new ApiError(404, 'STUDENT_INSTITUTION_NOT_ACTIVE', '学员不存在或未在当前机构接受服务');
    }
  }

  async assertStudentAccess(
    studentId: string,
    scope: EducationDataScope,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    await this.assertStudentVisible(studentId, scope, executor);
  }

  async getActiveStudentSnapshot(
    studentId: string,
    institutionId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<{ id: string; fullName: string }> {
    const record = await this.repository.findStudentInstitution(studentId, institutionId, executor);
    if (!record || record.student.status !== 'active' || record.relationship.status !== 'active') {
      throw new ApiError(404, 'STUDENT_INSTITUTION_NOT_ACTIVE', '学员不存在或未在当前机构接受服务');
    }
    return { id: record.student.id, fullName: record.student.fullName };
  }

  async getActiveTeacherSnapshot(
    teacherId: string,
    institutionId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<{ id: string; fullName: string }> {
    const record = await this.repository.findTeacherWithInstitution(
      teacherId,
      institutionId,
      executor,
    );
    if (!record || record.teacher.status !== 'active' || record.relationship.status !== 'active') {
      throw new ApiError(404, 'TEACHER_INSTITUTION_NOT_ACTIVE', '教师不存在或未在当前机构任职');
    }
    return { id: record.teacher.id, fullName: record.teacher.fullName };
  }

  private async assertStudentVisible(
    studentId: string,
    scope: EducationDataScope,
    executor: DatabaseExecutor,
  ) {
    const student = await this.repository.findStudent(studentId, scope, executor);
    if (!student) throw new ApiError(404, 'STUDENT_NOT_FOUND', '学员不存在或不在当前数据范围');
    return student;
  }

  private assertInstitutionWriteScope(
    scope: EducationDataScope,
  ): asserts scope is Extract<EducationDataScope, { kind: 'institution' }> {
    if (scope.kind !== 'institution') {
      throw new ApiError(403, 'PEOPLE_WRITE_SCOPE_DENIED', '当前数据范围不能修改人员档案');
    }
  }

  private async assertActiveIdentity(userId: string): Promise<void> {
    const user = await this.identity.getUser(userId);
    if (user.status !== 'active') throw new ApiError(422, 'IDENTITY_INACTIVE', '关联账号已停用');
  }

  private studentView(record: InstitutionStudentRecord): InstitutionStudent {
    return {
      id: record.id,
      fullName: record.fullName,
      preferredName: record.preferredName,
      grade: record.grade,
      school: record.school,
      gender: record.gender,
      birthDate: record.birthDate,
      notes: record.notes,
      status: record.status,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      institutionId: record.institutionId,
      relationshipStatus: record.relationshipStatus,
      relationshipRevision: record.relationshipRevision,
      relationshipSource: record.relationshipSource,
      relationshipSourceReference: record.relationshipSourceReference,
      joinedAt: record.joinedAt.toISOString(),
      endedAt: record.endedAt?.toISOString() ?? null,
    };
  }

  private guardianBindingView(
    binding: GuardianBindingRecord,
    guardian: GuardianRecord,
  ): GuardianBinding {
    return {
      id: binding.id,
      studentId: binding.studentId,
      guardian: {
        ...guardian,
        createdAt: guardian.createdAt.toISOString(),
        updatedAt: guardian.updatedAt.toISOString(),
      },
      relationship: binding.relationship,
      isPrimary: binding.isPrimary,
      status: binding.status,
      verificationStatus: binding.verificationStatus,
      verificationSource: binding.verificationSource,
      verifiedAt: binding.verifiedAt?.toISOString() ?? null,
      revokedAt: binding.revokedAt?.toISOString() ?? null,
      revision: binding.revision,
      createdAt: binding.createdAt.toISOString(),
      updatedAt: binding.updatedAt.toISOString(),
    };
  }

  private teacherView(
    teacher: TeacherRecord,
    relationship: TeacherInstitutionRecord,
  ): InstitutionTeacher {
    return {
      ...teacher,
      createdAt: teacher.createdAt.toISOString(),
      updatedAt: teacher.updatedAt.toISOString(),
      institutionId: relationship.institutionId,
      relationshipStatus: relationship.status,
      relationshipRevision: relationship.revision,
    };
  }

  private translateRelationshipConflict(error: unknown): void {
    if (this.isUniqueViolation(error)) {
      throw new ApiError(409, 'GUARDIAN_BINDING_CONFLICT', '监护人已绑定或主要联系人发生冲突');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
    );
  }
}
