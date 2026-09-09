import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  educationAssignmentInputSchema,
  type EducationAssignmentInput,
  type PermissionKey,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor, DatabaseHandle } from '../../../../database/database.js';
import type {
  AccessRole,
  AccessRoleSummary,
  AccessUserRole,
  PermissionDefinition,
} from '../../domain/model.js';
import { OWNER_ROLE_KEY } from '../../domain/system-permissions.js';
import { EDUCATION_ROLE_DEFAULTS } from '../../domain/education-permissions.js';
import {
  accessPermissions,
  accessRolePermissions,
  accessRoles,
  accessUserRoles,
  accessEducationAssignments,
} from './access-control.schema.js';

type RoleRecord = typeof accessRoles.$inferSelect;

export class AccessControlRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async synchronizeEducationRoles(): Promise<void> {
    await this.database.transaction(async (executor) => {
      for (const definition of EDUCATION_ROLE_DEFAULTS) {
        const [role] = await executor
          .insert(accessRoles)
          .values({
            key: definition.key,
            name: definition.name,
            system: true,
            description: '教务内置角色；数据访问必须通过机构及档案范围校验。',
          })
          .onConflictDoNothing()
          .returning({ id: accessRoles.id });
        // Existing roles and grants are never broadened during synchronization.
        if (role) await this.insertRolePermissions(executor, role.id, definition.permissions);
      }
    });
  }

  async educationAssignments(
    userId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<EducationAssignmentInput[]> {
    const rows = await executor
      .select()
      .from(accessEducationAssignments)
      .where(eq(accessEducationAssignments.userId, userId));
    return rows.map((row) => educationAssignmentInputSchema.parse(row));
  }

  async replaceEducationAssignments(
    userId: string,
    assignments: EducationAssignmentInput[],
    executor: DatabaseExecutor,
  ): Promise<void> {
    await executor
      .delete(accessEducationAssignments)
      .where(eq(accessEducationAssignments.userId, userId));
    if (assignments.length)
      await executor
        .insert(accessEducationAssignments)
        .values(assignments.map((assignment) => ({ ...assignment, userId })));
  }

  async synchronizeCatalog(source: string, definitions: PermissionDefinition[]): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const definition of definitions) {
        await transaction
          .insert(accessPermissions)
          .values(definition)
          .onConflictDoUpdate({
            target: accessPermissions.key,
            set: {
              source: definition.source,
              group: definition.group,
              name: definition.name,
              description: definition.description,
              updatedAt: new Date(),
            },
          });
      }
      const keys = definitions.map((definition) => definition.key);
      if (keys.length > 0) {
        await transaction
          .delete(accessPermissions)
          .where(
            and(eq(accessPermissions.source, source), notInArray(accessPermissions.key, keys)),
          );
      } else {
        await transaction.delete(accessPermissions).where(eq(accessPermissions.source, source));
      }
      const allPermissions = await transaction
        .select({ key: accessPermissions.key })
        .from(accessPermissions);
      await this.ensureOwnerRole(
        transaction,
        allPermissions.map((permission) => permission.key),
      );
    });
  }

  async permissionCatalog(): Promise<PermissionDefinition[]> {
    return this.database.db
      .select({
        key: accessPermissions.key,
        source: accessPermissions.source,
        group: accessPermissions.group,
        name: accessPermissions.name,
        description: accessPermissions.description,
      })
      .from(accessPermissions)
      .orderBy(asc(accessPermissions.group), asc(accessPermissions.key)) as Promise<
      PermissionDefinition[]
    >;
  }

  async permissionsForUser(userId: string): Promise<PermissionKey[]> {
    const records = await this.database.db
      .selectDistinct({ key: accessRolePermissions.permissionKey })
      .from(accessUserRoles)
      .innerJoin(accessRolePermissions, eq(accessRolePermissions.roleId, accessUserRoles.roleId))
      .where(eq(accessUserRoles.userId, userId))
      .orderBy(accessRolePermissions.permissionKey);
    return records.map((record) => record.key as PermissionKey);
  }

  async listRoles(): Promise<AccessRoleSummary[]> {
    const [roles, permissions, assignments] = await Promise.all([
      this.database.db.select().from(accessRoles).orderBy(asc(accessRoles.name)),
      this.database.db.select().from(accessRolePermissions),
      this.database.db.select().from(accessUserRoles),
    ]);
    const permissionCounts = this.countBy(permissions.map((item) => item.roleId));
    const userCounts = this.countBy(assignments.map((item) => item.roleId));
    return roles.map((role) => this.roleSummary(role, permissionCounts, userCounts));
  }

  async findRole(
    roleId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<AccessRole | null> {
    const [role] = await executor
      .select()
      .from(accessRoles)
      .where(eq(accessRoles.id, roleId))
      .limit(1);
    if (!role) return null;
    const [permissions, assignments] = await Promise.all([
      executor
        .select({ key: accessRolePermissions.permissionKey })
        .from(accessRolePermissions)
        .where(eq(accessRolePermissions.roleId, roleId))
        .orderBy(accessRolePermissions.permissionKey),
      executor
        .select({ userId: accessUserRoles.userId })
        .from(accessUserRoles)
        .where(eq(accessUserRoles.roleId, roleId)),
    ]);
    return {
      ...this.roleSummary(
        role,
        new Map([[roleId, permissions.length]]),
        new Map([[roleId, assignments.length]]),
      ),
      permissions: permissions.map((item) => item.key as PermissionKey),
    };
  }

  async createRole(
    input: {
      key: string;
      name: string;
      description?: string | null;
      permissions: PermissionKey[];
    },
    executor?: DatabaseExecutor,
  ): Promise<AccessRole> {
    const create = async (writeExecutor: DatabaseExecutor) => {
      await this.assertPermissionKeys(writeExecutor, input.permissions);
      const [role] = await writeExecutor
        .insert(accessRoles)
        .values({ key: input.key, name: input.name, description: input.description ?? null })
        .returning();
      if (!role) throw new Error('Failed to create role');
      await this.insertRolePermissions(writeExecutor, role.id, input.permissions);
      return {
        ...this.roleSummary(role, new Map([[role.id, input.permissions.length]]), new Map()),
        permissions: [...new Set(input.permissions)].sort(),
      };
    };
    return executor ? create(executor) : this.database.transaction(create);
  }

  async updateRole(
    roleId: string,
    input: { name?: string; description?: string | null },
    executor: DatabaseExecutor = this.database.db,
  ): Promise<AccessRole | null> {
    const [role] = await executor
      .update(accessRoles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(accessRoles.id, roleId))
      .returning();
    return role ? this.findRole(role.id, executor) : null;
  }

  async replaceRolePermissions(
    roleId: string,
    permissions: PermissionKey[],
    executor?: DatabaseExecutor,
  ): Promise<AccessRole | null> {
    const replace = async (writeExecutor: DatabaseExecutor) => {
      const exists = await this.findRole(roleId, writeExecutor);
      if (!exists) return null;
      await this.assertPermissionKeys(writeExecutor, permissions);
      await writeExecutor
        .delete(accessRolePermissions)
        .where(eq(accessRolePermissions.roleId, roleId));
      await this.insertRolePermissions(writeExecutor, roleId, permissions);
      await writeExecutor
        .update(accessRoles)
        .set({ updatedAt: new Date() })
        .where(eq(accessRoles.id, roleId));
      return this.findRole(roleId, writeExecutor);
    };
    return executor ? replace(executor) : this.database.transaction(replace);
  }

  async deleteRole(
    roleId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<boolean> {
    const [deleted] = await executor
      .delete(accessRoles)
      .where(eq(accessRoles.id, roleId))
      .returning({ id: accessRoles.id });
    return Boolean(deleted);
  }

  async rolesForUsers(
    userIds: string[],
    executor: DatabaseExecutor = this.database.db,
  ): Promise<Map<string, AccessUserRole[]>> {
    const result = new Map<string, AccessUserRole[]>();
    if (userIds.length === 0) return result;
    const records = await executor
      .select({
        userId: accessUserRoles.userId,
        id: accessRoles.id,
        key: accessRoles.key,
        name: accessRoles.name,
        system: accessRoles.system,
      })
      .from(accessUserRoles)
      .innerJoin(accessRoles, eq(accessRoles.id, accessUserRoles.roleId))
      .where(inArray(accessUserRoles.userId, userIds))
      .orderBy(accessRoles.name);
    for (const record of records) {
      const current = result.get(record.userId) ?? [];
      current.push({ id: record.id, key: record.key, name: record.name, system: record.system });
      result.set(record.userId, current);
    }
    return result;
  }

  async validateRoleIds(
    roleIds: string[],
    executor: DatabaseExecutor = this.database.db,
  ): Promise<boolean> {
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return true;
    const records = await executor
      .select({ id: accessRoles.id })
      .from(accessRoles)
      .where(inArray(accessRoles.id, unique));
    return records.length === unique.length;
  }

  async replaceUserRoles(
    userId: string,
    roleIds: string[],
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const unique = [...new Set(roleIds)];
    const replace = async (writeExecutor: DatabaseExecutor) => {
      await this.assertRoleIds(writeExecutor, unique);
      await writeExecutor.delete(accessUserRoles).where(eq(accessUserRoles.userId, userId));
      if (unique.length > 0) {
        await writeExecutor
          .insert(accessUserRoles)
          .values(unique.map((roleId) => ({ userId, roleId })));
      }
    };
    await (executor ? replace(executor) : this.database.transaction(replace));
  }

  async assignOwner(
    userId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<boolean> {
    const [owner] = await executor
      .select({ id: accessRoles.id })
      .from(accessRoles)
      .where(eq(accessRoles.key, OWNER_ROLE_KEY))
      .limit(1);
    if (!owner) throw new Error('Owner role has not been synchronized');
    const [assigned] = await executor
      .insert(accessUserRoles)
      .values({ userId, roleId: owner.id })
      .onConflictDoNothing()
      .returning({ userId: accessUserRoles.userId });
    return Boolean(assigned);
  }

  async userHasOwnerRole(
    userId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<boolean> {
    const roles = await this.rolesForUsers([userId], executor);
    return (roles.get(userId) ?? []).some((role) => role.key === OWNER_ROLE_KEY);
  }

  private async ensureOwnerRole(
    executor: DatabaseExecutor,
    permissionKeys: string[],
  ): Promise<void> {
    const [owner] = await executor
      .insert(accessRoles)
      .values({
        key: OWNER_ROLE_KEY,
        name: 'Owner',
        description: '系统所有者，拥有全部已注册权限。',
        system: true,
      })
      .onConflictDoUpdate({
        target: accessRoles.key,
        set: {
          name: 'Owner',
          description: '系统所有者，拥有全部已注册权限。',
          system: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: accessRoles.id });
    if (!owner) throw new Error('Failed to synchronize Owner role');
    await executor.delete(accessRolePermissions).where(eq(accessRolePermissions.roleId, owner.id));
    await this.insertRolePermissions(executor, owner.id, permissionKeys as PermissionKey[]);
  }

  private async assertPermissionKeys(
    executor: DatabaseExecutor,
    keys: PermissionKey[],
  ): Promise<void> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return;
    const records = await executor
      .select({ key: accessPermissions.key })
      .from(accessPermissions)
      .where(inArray(accessPermissions.key, unique));
    if (records.length !== unique.length) throw new Error('UNKNOWN_PERMISSION_KEY');
  }

  private async assertRoleIds(executor: DatabaseExecutor, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const records = await executor
      .select({ id: accessRoles.id })
      .from(accessRoles)
      .where(inArray(accessRoles.id, roleIds));
    if (records.length !== roleIds.length) throw new Error('UNKNOWN_ROLE_ID');
  }

  private async insertRolePermissions(
    executor: DatabaseExecutor,
    roleId: string,
    permissions: PermissionKey[],
  ): Promise<void> {
    const unique = [...new Set(permissions)];
    if (unique.length === 0) return;
    await executor
      .insert(accessRolePermissions)
      .values(unique.map((permissionKey) => ({ roleId, permissionKey })))
      .onConflictDoNothing();
  }

  private roleSummary(
    role: RoleRecord,
    permissionCounts: Map<string, number>,
    userCounts: Map<string, number>,
  ): AccessRoleSummary {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      system: role.system,
      permissionCount: permissionCounts.get(role.id) ?? 0,
      userCount: userCounts.get(role.id) ?? 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private countBy(values: string[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
    return result;
  }
}
