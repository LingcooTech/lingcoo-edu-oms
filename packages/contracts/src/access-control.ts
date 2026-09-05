import { z } from 'zod';

import { idSchema } from './common/ids.js';
import { isoDateTimeSchema } from './common/time.js';
import {
  emailAddressSchema,
  identityStatusSchema,
  identityUserSchema,
  passwordSchema,
} from './identity.js';

export const permissionKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/)
  .max(120);

export const roleKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/)
  .max(120);

export const permissionSchema = z.object({
  key: permissionKeySchema,
  source: z.string().min(1).max(80),
  group: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(300),
});

export const currentPermissionsSchema = z.object({ permissions: z.array(permissionKeySchema) });
export const permissionCatalogSchema = z.object({ items: z.array(permissionSchema) });

export const accessRoleSummarySchema = z.object({
  id: idSchema,
  key: roleKeySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(300).nullable(),
  system: z.boolean(),
  permissionCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const accessRoleSchema = accessRoleSummarySchema.extend({
  permissions: z.array(permissionKeySchema),
});

export const roleListSchema = z.object({ items: z.array(accessRoleSummarySchema) });
export const createRoleRequestSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(permissionKeySchema).default([]),
});
export const updateRoleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(300).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个待更新字段');
export const replaceRolePermissionsRequestSchema = z.object({
  permissions: z.array(permissionKeySchema),
});

export const accessUserRoleSchema = z.object({
  id: idSchema,
  key: roleKeySchema,
  name: z.string(),
  system: z.boolean(),
});
export const accessUserSchema = identityUserSchema.extend({ roles: z.array(accessUserRoleSchema) });
export const accessUserPageSchema = z.object({
  items: z.array(accessUserSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const createAccessUserRequestSchema = z.object({
  email: emailAddressSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120).nullable().optional(),
  emailVerified: z.boolean().default(false),
  roleIds: z.array(idSchema).default([]),
});
export const updateAccessUserRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    status: identityStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, '至少提供一个待更新字段');
export const replaceUserRolesRequestSchema = z.object({ roleIds: z.array(idSchema) });

export type PermissionKey = z.infer<typeof permissionKeySchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type CurrentPermissions = z.infer<typeof currentPermissionsSchema>;
export type AccessRoleSummary = z.infer<typeof accessRoleSummarySchema>;
export type AccessRole = z.infer<typeof accessRoleSchema>;
export type AccessUserRole = z.infer<typeof accessUserRoleSchema>;
export type AccessUser = z.infer<typeof accessUserSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;
export type ReplaceRolePermissionsRequest = z.infer<typeof replaceRolePermissionsRequestSchema>;
export type CreateAccessUserRequest = z.infer<typeof createAccessUserRequestSchema>;
export type UpdateAccessUserRequest = z.infer<typeof updateAccessUserRequestSchema>;
export type ReplaceUserRolesRequest = z.infer<typeof replaceUserRolesRequestSchema>;
