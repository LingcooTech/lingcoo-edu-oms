import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAccessUserRequest,
  CreateRoleRequest,
  PermissionKey,
  UpdateAccessUserRequest,
  UpdateRoleRequest,
} from '@lingcoo-edu-oms/contracts';

import { accessApi } from './api';

export const accessQueryKeys = {
  permissions: ['access', 'permissions'] as const,
  catalog: ['access', 'catalog'] as const,
  roles: ['access', 'roles'] as const,
  role: (id: string) => ['access', 'roles', id] as const,
  users: (input: object) => ['access', 'users', input] as const,
  user: (id: string) => ['access', 'users', id] as const,
};

export function useCurrentPermissions() {
  return useQuery({
    queryKey: accessQueryKeys.permissions,
    queryFn: () => accessApi.currentPermissions(),
    retry: false,
  });
}

export function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: accessQueryKeys.catalog,
    queryFn: () => accessApi.permissionCatalog(),
    enabled,
  });
}

export function useRoles(enabled = true) {
  return useQuery({
    queryKey: accessQueryKeys.roles,
    queryFn: () => accessApi.listRoles(),
    enabled,
  });
}

export function useRole(id: string | null) {
  return useQuery({
    queryKey: accessQueryKeys.role(id ?? 'none'),
    queryFn: () => accessApi.getRole(id!),
    enabled: Boolean(id),
  });
}

export function useCreateRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleRequest) => accessApi.createRole(input),
    onSuccess: () => client.invalidateQueries({ queryKey: accessQueryKeys.roles }),
  });
}

export function useUpdateRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleRequest }) =>
      accessApi.updateRole(id, input),
    onSuccess: (role) => {
      client.setQueryData(accessQueryKeys.role(role.id), role);
      void client.invalidateQueries({ queryKey: accessQueryKeys.roles });
      void client.invalidateQueries({ queryKey: accessQueryKeys.permissions });
    },
  });
}

export function useReplaceRolePermissions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: PermissionKey[] }) =>
      accessApi.replaceRolePermissions(id, permissions),
    onSuccess: (role) => {
      client.setQueryData(accessQueryKeys.role(role.id), role);
      void client.invalidateQueries({ queryKey: accessQueryKeys.roles });
      void client.invalidateQueries({ queryKey: accessQueryKeys.permissions });
    },
  });
}

export function useDeleteRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => accessApi.deleteRole(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: accessQueryKeys.roles });
      void client.invalidateQueries({ queryKey: accessQueryKeys.permissions });
    },
  });
}

export interface UserListInput {
  page: number;
  pageSize: number;
  search?: string;
  status?: 'active' | 'disabled';
}

export function useUsers(input: UserListInput) {
  return useQuery({
    queryKey: accessQueryKeys.users(input),
    queryFn: () => accessApi.listUsers(input),
  });
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: accessQueryKeys.user(id ?? 'none'),
    queryFn: () => accessApi.getUser(id!),
    enabled: Boolean(id),
  });
}

export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccessUserRequest) => accessApi.createUser(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['access', 'users'] }),
  });
}

export function useUpdateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccessUserRequest }) =>
      accessApi.updateUser(id, input),
    onSuccess: (user) => {
      client.setQueryData(accessQueryKeys.user(user.id), user);
      void client.invalidateQueries({ queryKey: ['access', 'users'] });
    },
  });
}

export function useReplaceUserRoles() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      accessApi.replaceUserRoles(id, roleIds),
    onSuccess: (user) => {
      client.setQueryData(accessQueryKeys.user(user.id), user);
      void client.invalidateQueries({ queryKey: ['access', 'users'] });
      void client.invalidateQueries({ queryKey: accessQueryKeys.roles });
      void client.invalidateQueries({ queryKey: accessQueryKeys.permissions });
    },
  });
}
