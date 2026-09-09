import { ApiError } from '@lingcoo-tech/http';
import type {
  CreateAccessUserRequest,
  CreateRoleRequest,
  PermissionKey,
  UpdateAccessUserRequest,
  UpdateRoleRequest,
  EducationDataScope,
  EducationAssignmentInput,
  TeacherCapabilities,
} from '@lingcoo-edu-oms/contracts';
import { replaceEducationAssignmentsRequestSchema } from '@lingcoo-edu-oms/contracts';

import type { IdentityService, PublicIdentityUser } from '../../identity/public.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { EducationDirectory } from '../../people/public.js';
import type { DatabaseHandle } from '../../../database/database.js';
import type {
  AccessRole,
  AccessRoleSummary,
  AccessUserRole,
  PermissionDefinition,
} from '../domain/model.js';
import { CORE_PERMISSION_DEFINITIONS, OWNER_ROLE_KEY } from '../domain/system-permissions.js';
import {
  EDUCATION_PERMISSION_DEFINITIONS,
  EDUCATION_ROLE_DEFAULTS,
} from '../domain/education-permissions.js';
import type { AccessControlRepository } from '../infrastructure/persistence/access-control.repository.js';

export interface AccessUser extends PublicIdentityUser {
  roles: AccessUserRole[];
}

export interface AccessUserPage {
  items: AccessUser[];
  page: number;
  pageSize: number;
  total: number;
}

export class AccessControlService {
  constructor(
    private readonly repository: AccessControlRepository,
    private readonly identity: IdentityService,
    private readonly database: DatabaseHandle,
    private readonly audit: AuditWriter,
    private readonly educationDirectory?: EducationDirectory,
  ) {}

  async synchronizeSystemAccess(): Promise<void> {
    await this.repository.synchronizeCatalog('core', CORE_PERMISSION_DEFINITIONS);
    await this.repository.synchronizeCatalog('education', EDUCATION_PERMISSION_DEFINITIONS);
    await this.repository.synchronizeEducationRoles();
  }

  educationAssignments(userId: string): Promise<EducationAssignmentInput[]> {
    return this.repository.educationAssignments(userId);
  }

  /** null means organization-wide access; an empty array means no visible institution. */
  async visibleInstitutionIds(userId: string): Promise<string[] | null> {
    const [roles, permissions, assignments] = await Promise.all([
      this.repository.rolesForUsers([userId]),
      this.permissionsForUser(userId),
      this.repository.educationAssignments(userId),
    ]);
    const roleKeys = roles.get(userId)?.map((role) => role.key) ?? [];
    if (
      permissions.includes('education.institutions.read') &&
      roleKeys.some((role) => role === OWNER_ROLE_KEY || role === 'admin')
    ) {
      return null;
    }
    const active = assignments.filter((item) => item.active);
    if (!this.educationDirectory) return [];
    const validated = await Promise.allSettled(
      active.map(async (assignment) => {
        await this.educationDirectory!.validateAssignment(userId, assignment);
        return assignment.institutionId;
      }),
    );
    return [
      ...new Set(
        validated.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
      ),
    ];
  }

  async replaceEducationAssignments(
    userId: string,
    assignments: EducationAssignmentInput[],
    context: AuditContext,
  ): Promise<void> {
    const parsed = replaceEducationAssignmentsRequestSchema.parse({ assignments });
    await this.identity.getUser(userId);
    if (parsed.assignments.length && !this.educationDirectory) {
      throw new ApiError(503, 'EDUCATION_DIRECTORY_UNAVAILABLE', '人员与机构授权目录尚未就绪');
    }
    await this.database.transaction(async (transaction) => {
      for (const assignment of parsed.assignments) {
        await this.educationDirectory!.validateAssignment(userId, assignment, transaction);
      }
      const before = await this.repository.educationAssignments(userId, transaction);
      await this.repository.replaceEducationAssignments(userId, parsed.assignments, transaction);
      await this.audit.record(
        {
          ...context,
          category: 'access',
          action: 'access.education.assignments-replaced',
          resourceType: 'identity.user',
          resourceId: userId,
          changes: [{ field: 'educationAssignments', before, after: parsed.assignments }],
        },
        transaction,
      );
    });
  }

  /** Resolve a mandatory query filter. Role permission alone never grants student access. */
  async resolveEducationScope(input: {
    userId: string;
    institutionId: string;
    permission: string;
    capability?: keyof TeacherCapabilities;
  }): Promise<EducationDataScope> {
    const user = await this.identity.getUser(input.userId);
    if (user.status !== 'active' || user.mustChangePassword) {
      throw new ApiError(403, 'ACCESS_SCOPE_DENIED', '当前账号不可访问教务数据');
    }
    if (!EDUCATION_PERMISSION_DEFINITIONS.some((p) => p.key === input.permission)) {
      throw new ApiError(403, 'ACCESS_SCOPE_DENIED', '未知教务权限');
    }
    const roles = (await this.repository.rolesForUsers([input.userId])).get(input.userId) ?? [];
    const permissions = await this.permissionsForUser(input.userId);
    if (
      roles.some((r) => r.key === OWNER_ROLE_KEY || r.key === 'admin') &&
      permissions.includes(input.permission)
    ) {
      return { kind: 'institution', institutionId: input.institutionId };
    }
    const assignments = await this.repository.educationAssignments(input.userId);
    for (const assignment of assignments) {
      if (
        !assignment.active ||
        assignment.institutionId !== input.institutionId ||
        !roles.some((r) => r.key === assignment.role)
      )
        continue;
      if (!this.educationDirectory) continue;
      try {
        await this.educationDirectory.validateAssignment(input.userId, assignment);
      } catch {
        continue;
      }
      const defaults = EDUCATION_ROLE_DEFAULTS.find((r) => r.key === assignment.role)!;
      const capabilityPermissions: Record<keyof TeacherCapabilities, string[]> = {
        createClassSession: ['education.sessions.manage'],
        createAdHocSession: ['education.sessions.manage'],
        manageSessionRoster: ['education.sessions.manage'],
        enrollStudents: ['education.enrollments.manage'],
        viewAllStudents: ['education.students.read'],
        setLessonUnits: ['education.lesson-balances.manage'],
        manageClasses: ['education.classes.manage'],
      };
      const hasCapability =
        assignment.role === 'teacher' &&
        input.capability &&
        assignment.teacherCapabilities[input.capability] === true &&
        capabilityPermissions[input.capability].includes(input.permission);
      if (input.capability && assignment.role === 'teacher' && !hasCapability) continue;
      if (
        !hasCapability &&
        (!defaults.permissions.includes(input.permission) ||
          !permissions.includes(input.permission))
      )
        continue;
      if (assignment.role === 'institution_admin')
        return { kind: 'institution', institutionId: input.institutionId };
      if (assignment.role === 'teacher' && assignment.teacherId) {
        // Even legacy viewAllStudents is restricted to this teacher's relationships.
        return {
          kind: 'teacher',
          institutionId: input.institutionId,
          teacherId: assignment.teacherId,
        };
      }
      if (assignment.role === 'parent' && assignment.guardianId) {
        return {
          kind: 'guardian',
          institutionId: input.institutionId,
          guardianId: assignment.guardianId,
        };
      }
    }
    throw new ApiError(403, 'ACCESS_SCOPE_DENIED', '没有匹配的机构及档案访问范围');
  }

  async assignOwner(userId: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      if (!(await this.repository.assignOwner(userId, transaction))) return;
      await this.audit.record(
        {
          actorType: 'system',
          category: 'system',
          action: 'access.owner.assigned',
          resourceType: 'identity.user',
          resourceId: userId,
        },
        transaction,
      );
    });
  }

  permissionsForUser(userId: string): Promise<PermissionKey[]> {
    return this.repository.permissionsForUser(userId);
  }

  permissionCatalog(): Promise<PermissionDefinition[]> {
    return this.repository.permissionCatalog();
  }

  listRoles(): Promise<AccessRoleSummary[]> {
    return this.repository.listRoles();
  }

  async getRole(roleId: string): Promise<AccessRole> {
    const role = await this.repository.findRole(roleId);
    if (!role) throw new ApiError(404, 'ACCESS_ROLE_NOT_FOUND', '角色不存在');
    return role;
  }

  async createRole(input: CreateRoleRequest, context: AuditContext): Promise<AccessRole> {
    if (
      input.key.startsWith('system.') ||
      EDUCATION_ROLE_DEFAULTS.some((role) => role.key === input.key)
    ) {
      throw new ApiError(400, 'ACCESS_RESERVED_ROLE_KEY', 'system.* 为系统角色保留命名空间');
    }
    try {
      return await this.database.transaction(async (transaction) => {
        const role = await this.repository.createRole(input, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'access',
            action: 'access.role.created',
            resourceType: 'access.role',
            resourceId: role.id,
            changes: [
              { field: 'key', before: null, after: role.key },
              { field: 'name', before: null, after: role.name },
              { field: 'permissions', before: null, after: role.permissions },
            ],
          },
          transaction,
        );
        return role;
      });
    } catch (error) {
      this.translateRepositoryError(error);
      throw error;
    }
  }

  async updateRole(
    roleId: string,
    input: UpdateRoleRequest,
    context: AuditContext,
  ): Promise<AccessRole> {
    const before = await this.assertMutableRole(roleId);
    return this.database.transaction(async (transaction) => {
      const role = await this.repository.updateRole(roleId, input, transaction);
      if (!role) throw new ApiError(404, 'ACCESS_ROLE_NOT_FOUND', '角色不存在');
      await this.audit.record(
        {
          ...context,
          category: 'access',
          action: 'access.role.updated',
          resourceType: 'access.role',
          resourceId: roleId,
          changes: this.changes(before, role, ['name', 'description']),
        },
        transaction,
      );
      return role;
    });
  }

  async replaceRolePermissions(
    roleId: string,
    permissions: PermissionKey[],
    context: AuditContext,
  ): Promise<AccessRole> {
    const before = await this.assertMutableRole(roleId);
    try {
      return await this.database.transaction(async (transaction) => {
        const role = await this.repository.replaceRolePermissions(roleId, permissions, transaction);
        if (!role) throw new ApiError(404, 'ACCESS_ROLE_NOT_FOUND', '角色不存在');
        await this.audit.record(
          {
            ...context,
            category: 'access',
            action: 'access.role.permissions-replaced',
            resourceType: 'access.role',
            resourceId: roleId,
            changes: [
              { field: 'permissions', before: before.permissions, after: role.permissions },
            ],
          },
          transaction,
        );
        return role;
      });
    } catch (error) {
      this.translateRepositoryError(error);
      throw error;
    }
  }

  async deleteRole(roleId: string, context: AuditContext): Promise<void> {
    const before = await this.assertMutableRole(roleId);
    await this.database.transaction(async (transaction) => {
      if (!(await this.repository.deleteRole(roleId, transaction))) {
        throw new ApiError(404, 'ACCESS_ROLE_NOT_FOUND', '角色不存在');
      }
      await this.audit.record(
        {
          ...context,
          category: 'access',
          action: 'access.role.deleted',
          resourceType: 'access.role',
          resourceId: roleId,
          changes: [{ field: 'role', before: this.roleAuditView(before), after: null }],
        },
        transaction,
      );
    });
  }

  async listUsers(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: 'active' | 'disabled';
  }): Promise<AccessUserPage> {
    const page = await this.identity.listUsers(input);
    const roles = await this.repository.rolesForUsers(page.items.map((user) => user.id));
    return {
      ...page,
      items: page.items.map((user) => ({ ...user, roles: roles.get(user.id) ?? [] })),
    };
  }

  async getUser(userId: string): Promise<AccessUser> {
    const user = await this.identity.getUser(userId);
    const roles = await this.repository.rolesForUsers([userId]);
    return { ...user, roles: roles.get(userId) ?? [] };
  }

  async resetUserPassword(
    actorUserId: string,
    userId: string,
    newPassword: string,
    context: AuditContext,
  ): Promise<void> {
    if (actorUserId === userId) throw new ApiError(400, 'ACCESS_SELF_RESET', '请使用修改密码功能');
    if (await this.repository.userHasOwnerRole(userId)) {
      throw new ApiError(400, 'ACCESS_OWNER_PROTECTED', 'Owner 账号不能通过管理接口重置密码');
    }
    await this.identity.adminResetPassword(userId, newPassword, context);
  }

  async createUser(input: CreateAccessUserRequest, context: AuditContext): Promise<AccessUser> {
    const userId = await this.database.transaction(async (transaction) => {
      if (!(await this.repository.validateRoleIds(input.roleIds, transaction))) {
        throw new ApiError(400, 'ACCESS_UNKNOWN_ROLE', '包含不存在的角色');
      }
      const user = await this.identity.createUser(input, { executor: transaction });
      await this.repository.replaceUserRoles(user.id, input.roleIds, transaction);
      await this.audit.record(
        {
          ...context,
          category: 'account',
          action: 'access.account.created',
          resourceType: 'identity.user',
          resourceId: user.id,
          changes: [
            { field: 'email', before: null, after: user.email },
            { field: 'phone', before: null, after: user.phone },
            { field: 'mustChangePassword', before: null, after: user.mustChangePassword },
            { field: 'displayName', before: null, after: user.displayName },
            { field: 'status', before: null, after: user.status },
            { field: 'roleIds', before: null, after: input.roleIds },
          ],
        },
        transaction,
      );
      return user.id;
    });
    return this.getUser(userId);
  }

  synchronizePermissions(source: string, definitions: PermissionDefinition[]): Promise<void> {
    if (definitions.some((definition) => definition.source !== source)) {
      throw new Error('Permission definition source does not match the registry source');
    }
    return this.repository.synchronizeCatalog(source, definitions);
  }

  async updateUser(
    actorUserId: string,
    userId: string,
    input: UpdateAccessUserRequest,
    context: AuditContext,
  ): Promise<AccessUser> {
    const before = await this.getUser(userId);
    if (input.status === 'disabled') {
      if (actorUserId === userId) {
        throw new ApiError(400, 'ACCESS_SELF_DISABLE', '不能停用当前登录账号');
      }
      if (await this.repository.userHasOwnerRole(userId)) {
        throw new ApiError(400, 'ACCESS_OWNER_PROTECTED', 'Owner 账号不能被停用');
      }
    }
    await this.database.transaction(async (transaction) => {
      const user = await this.identity.updateUser({ userId, ...input }, { executor: transaction });
      await this.audit.record(
        {
          ...context,
          category: 'account',
          action: 'access.account.updated',
          resourceType: 'identity.user',
          resourceId: userId,
          changes: this.changes(before, user, ['displayName', 'status']),
        },
        transaction,
      );
    });
    return this.getUser(userId);
  }

  async replaceUserRoles(
    userId: string,
    roleIds: string[],
    context: AuditContext,
  ): Promise<AccessUser> {
    await this.identity.getUser(userId);
    const current = await this.getUser(userId);
    if (current.roles.some((role) => role.key === OWNER_ROLE_KEY)) {
      const roles = await this.repository.listRoles();
      const owner = roles.find((role) => role.key === OWNER_ROLE_KEY);
      if (owner && !roleIds.includes(owner.id)) {
        throw new ApiError(400, 'ACCESS_OWNER_PROTECTED', 'Owner 角色不能通过管理接口移除');
      }
    }
    try {
      await this.database.transaction(async (transaction) => {
        await this.repository.replaceUserRoles(userId, roleIds, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'access',
            action: 'access.account.roles-replaced',
            resourceType: 'identity.user',
            resourceId: userId,
            changes: [
              {
                field: 'roleIds',
                before: current.roles.map((role) => role.id).sort(),
                after: [...new Set(roleIds)].sort(),
              },
            ],
          },
          transaction,
        );
      });
      return this.getUser(userId);
    } catch (error) {
      this.translateRepositoryError(error);
      throw error;
    }
  }

  private async assertMutableRole(roleId: string): Promise<AccessRole> {
    const role = await this.getRole(roleId);
    if (role.system)
      throw new ApiError(400, 'ACCESS_SYSTEM_ROLE_PROTECTED', '系统角色不能修改或删除');
    return role;
  }

  private changes<T extends object>(
    before: T,
    after: T,
    fields: Array<keyof T>,
  ): Array<{ field: string; before: unknown; after: unknown }> {
    return fields
      .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
      .map((field) => ({
        field: String(field),
        before: before[field] ?? null,
        after: after[field] ?? null,
      }));
  }

  private roleAuditView(role: AccessRole) {
    return {
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    };
  }

  private translateRepositoryError(error: unknown): void {
    if (error instanceof Error && error.message === 'UNKNOWN_PERMISSION_KEY') {
      throw new ApiError(400, 'ACCESS_UNKNOWN_PERMISSION', '包含未注册的权限');
    }
    if (error instanceof Error && error.message === 'UNKNOWN_ROLE_ID') {
      throw new ApiError(400, 'ACCESS_UNKNOWN_ROLE', '包含不存在的角色');
    }
    if (this.isUniqueViolation(error)) {
      throw new ApiError(409, 'ACCESS_ROLE_KEY_EXISTS', '角色标识已存在');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    let current = error;
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof current !== 'object' || current === null) return false;
      if ('code' in current && (current as { code?: unknown }).code === '23505') return true;
      current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
    }
    return false;
  }
}
