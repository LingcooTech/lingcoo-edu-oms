import {
  acceptedActionSchema,
  accessRoleSchema,
  accessUserPageSchema,
  accessUserSchema,
  createAccessUserRequestSchema,
  createRoleRequestSchema,
  currentPermissionsSchema,
  permissionCatalogSchema,
  replaceRolePermissionsRequestSchema,
  replaceUserRolesRequestSchema,
  roleListSchema,
  updateAccessUserRequestSchema,
  updateRoleRequestSchema,
  type CreateAccessUserRequest,
  type CreateRoleRequest,
  type PermissionKey,
  type UpdateAccessUserRequest,
  type UpdateRoleRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function createAccessControlApi(client: ApiClient) {
  return {
    currentPermissions() {
      return client.request({ path: '/api/access/permissions', schema: currentPermissionsSchema });
    },
    permissionCatalog() {
      return client.request({ path: '/api/access/catalog', schema: permissionCatalogSchema });
    },
    listRoles() {
      return client.request({ path: '/api/access/roles', schema: roleListSchema });
    },
    getRole(id: string) {
      return client.request({
        path: `/api/access/roles/${encodeURIComponent(id)}`,
        schema: accessRoleSchema,
      });
    },
    createRole(input: CreateRoleRequest) {
      return client.request({
        method: 'POST',
        path: '/api/access/roles',
        body: createRoleRequestSchema.parse(input),
        schema: accessRoleSchema,
      });
    },
    updateRole(id: string, input: UpdateRoleRequest) {
      return client.request({
        method: 'PATCH',
        path: `/api/access/roles/${encodeURIComponent(id)}`,
        body: updateRoleRequestSchema.parse(input),
        schema: accessRoleSchema,
      });
    },
    replaceRolePermissions(id: string, permissions: PermissionKey[]) {
      return client.request({
        method: 'PUT',
        path: `/api/access/roles/${encodeURIComponent(id)}/permissions`,
        body: replaceRolePermissionsRequestSchema.parse({ permissions }),
        schema: accessRoleSchema,
      });
    },
    deleteRole(id: string) {
      return client.request({
        method: 'DELETE',
        path: `/api/access/roles/${encodeURIComponent(id)}`,
        schema: acceptedActionSchema,
      });
    },
    listUsers(
      input: {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: 'active' | 'disabled';
      } = {},
    ) {
      return client.request({
        path: `/api/access/users${queryString(input)}`,
        schema: accessUserPageSchema,
      });
    },
    getUser(id: string) {
      return client.request({
        path: `/api/access/users/${encodeURIComponent(id)}`,
        schema: accessUserSchema,
      });
    },
    createUser(input: CreateAccessUserRequest) {
      return client.request({
        method: 'POST',
        path: '/api/access/users',
        body: createAccessUserRequestSchema.parse(input),
        schema: accessUserSchema,
      });
    },
    updateUser(id: string, input: UpdateAccessUserRequest) {
      return client.request({
        method: 'PATCH',
        path: `/api/access/users/${encodeURIComponent(id)}`,
        body: updateAccessUserRequestSchema.parse(input),
        schema: accessUserSchema,
      });
    },
    replaceUserRoles(id: string, roleIds: string[]) {
      return client.request({
        method: 'PUT',
        path: `/api/access/users/${encodeURIComponent(id)}/roles`,
        body: replaceUserRolesRequestSchema.parse({ roleIds }),
        schema: accessUserSchema,
      });
    },
  };
}

export type AccessControlApi = ReturnType<typeof createAccessControlApi>;
