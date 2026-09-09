import { ApiError } from '@lingcoo-tech/http';
import {
  createAccessUserRequestSchema,
  adminResetPasswordRequestSchema,
  replaceEducationAssignmentsRequestSchema,
  createRoleRequestSchema,
  replaceRolePermissionsRequestSchema,
  replaceUserRolesRequestSchema,
  updateAccessUserRequestSchema,
  updateRoleRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { PublicIdentityUser } from '../../identity/public.js';
import { auditContextFromRequest } from '../../audit/public.js';
import type { AccessControlService, AccessUser } from '../application/access-control.service.js';
import type { AccessRole, AccessRoleSummary } from '../domain/model.js';

const idParamsSchema = z.object({ id: z.uuid() });
const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function serializeRole<T extends AccessRole | AccessRoleSummary>(role: T) {
  return {
    ...role,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

function serializeUser(user: PublicIdentityUser | AccessUser) {
  return {
    ...user,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

function currentActor(request: Parameters<typeof auditContextFromRequest>[0]) {
  const user = request.identityPrincipal!.user;
  return auditContextFromRequest(request, {
    type: 'user',
    id: user.id,
    label: user.displayName ?? user.email ?? user.phone,
  });
}

export async function registerAccessControlRoutes(
  app: FastifyInstance,
  service: AccessControlService,
): Promise<void> {
  app.get(
    '/api/access/permissions',
    { config: { access: { permissions: [] } } },
    async (request) => ({
      permissions: request.accessPermissions ?? [],
    }),
  );

  app.get(
    '/api/access/catalog',
    { config: { access: { permissions: ['roles.read'] } } },
    async () => ({
      items: await service.permissionCatalog(),
    }),
  );

  app.get(
    '/api/access/roles',
    { config: { access: { permissions: ['roles.read'] } } },
    async () => ({
      items: (await service.listRoles()).map(serializeRole),
    }),
  );

  app.post(
    '/api/access/roles',
    { config: { access: { permissions: ['roles.manage'] } } },
    async (request, reply) => {
      const role = await service.createRole(
        parse(createRoleRequestSchema, request.body),
        currentActor(request),
      );
      return reply.status(201).send(serializeRole(role));
    },
  );

  app.get(
    '/api/access/roles/:id',
    { config: { access: { permissions: ['roles.read'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return serializeRole(await service.getRole(id));
    },
  );

  app.patch(
    '/api/access/roles/:id',
    { config: { access: { permissions: ['roles.manage'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return serializeRole(
        await service.updateRole(
          id,
          parse(updateRoleRequestSchema, request.body),
          currentActor(request),
        ),
      );
    },
  );

  app.put(
    '/api/access/roles/:id/permissions',
    { config: { access: { permissions: ['roles.manage'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      const input = parse(replaceRolePermissionsRequestSchema, request.body);
      return serializeRole(
        await service.replaceRolePermissions(id, input.permissions, currentActor(request)),
      );
    },
  );

  app.delete(
    '/api/access/roles/:id',
    { config: { access: { permissions: ['roles.manage'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      await service.deleteRole(id, currentActor(request));
      return { accepted: true } as const;
    },
  );

  app.get(
    '/api/access/users',
    { config: { access: { permissions: ['accounts.read'] } } },
    async (request) => {
      const page = await service.listUsers(parse(userListQuerySchema, request.query));
      return { ...page, items: page.items.map(serializeUser) };
    },
  );

  app.post(
    '/api/access/users',
    { config: { access: { permissions: ['accounts.manage'] } } },
    async (request, reply) => {
      const input = parse(createAccessUserRequestSchema, request.body);
      if (input.roleIds.length > 0 && !request.accessPermissions?.includes('roles.manage')) {
        throw new ApiError(403, 'ACCESS_PERMISSION_DENIED', '分配角色还需要管理角色权限');
      }
      const user = await service.createUser(input, currentActor(request));
      return reply.status(201).send(serializeUser(user));
    },
  );

  app.get(
    '/api/access/users/:id',
    { config: { access: { permissions: ['accounts.read'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return serializeUser(await service.getUser(id));
    },
  );

  app.patch(
    '/api/access/users/:id',
    { config: { access: { permissions: ['accounts.manage'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      return serializeUser(
        await service.updateUser(
          request.identityPrincipal!.user.id,
          id,
          parse(updateAccessUserRequestSchema, request.body),
          currentActor(request),
        ),
      );
    },
  );

  app.put(
    '/api/access/users/:id/roles',
    { config: { access: { permissions: ['accounts.manage', 'roles.manage'] } } },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      const input = parse(replaceUserRolesRequestSchema, request.body);
      return serializeUser(
        await service.replaceUserRoles(id, input.roleIds, currentActor(request)),
      );
    },
  );

  app.post(
    '/api/access/users/:id/password/reset',
    {
      config: { access: { permissions: ['accounts.reset-password'] } },
      preHandler: app.rateLimit({ max: 10, timeWindow: '1 minute' }),
    },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      const { newPassword } = parse(adminResetPasswordRequestSchema, request.body);
      await service.resetUserPassword(
        request.identityPrincipal!.user.id,
        id,
        newPassword,
        currentActor(request),
      );
      return { accepted: true } as const;
    },
  );

  app.get(
    '/api/access/education-context',
    { config: { access: { permissions: [] } } },
    async (request) => ({
      items: await service.educationAssignments(request.identityPrincipal!.user.id),
    }),
  );
  app.get(
    '/api/access/users/:id/education-assignments',
    {
      config: { access: { permissions: ['accounts.read'] } },
    },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      await service.getUser(id);
      return { items: await service.educationAssignments(id) };
    },
  );
  app.put(
    '/api/access/users/:id/education-assignments',
    {
      config: { access: { permissions: ['accounts.manage', 'roles.manage'] } },
    },
    async (request) => {
      const { id } = parse(idParamsSchema, request.params);
      const { assignments } = parse(replaceEducationAssignmentsRequestSchema, request.body);
      await service.replaceEducationAssignments(id, assignments, currentActor(request));
      return { items: await service.educationAssignments(id) };
    },
  );
}
