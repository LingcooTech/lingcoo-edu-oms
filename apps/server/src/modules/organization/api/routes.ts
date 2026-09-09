import { ApiError } from '@lingcoo-tech/http';
import {
  createInstitutionRequestSchema,
  institutionListQuerySchema,
  updateInstitutionRequestSchema,
  updateOrganizationProfileRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { AccessControlService } from '../../access-control/public.js';
import type { OrganizationService } from '../application/organization.service.js';

const institutionParamsSchema = z.object({ institutionId: z.uuid() });

export async function registerOrganizationRoutes(
  app: FastifyInstance,
  service: OrganizationService,
  access: AccessControlService,
) {
  app.get(
    '/api/organization',
    {
      config: {
        access: {
          permissions: ['education.institutions.read'],
          allowUnscopedEducation: true,
        },
      },
    },
    async () => service.getProfile(),
  );
  app.patch(
    '/api/organization',
    {
      config: {
        access: {
          permissions: ['education.institutions.manage'],
          allowUnscopedEducation: true,
        },
      },
    },
    async (request) =>
      service.updateProfile(
        parse(updateOrganizationProfileRequestSchema, request.body),
        actor(request),
      ),
  );
  app.get(
    '/api/institutions',
    {
      config: {
        access: {
          permissions: ['education.institutions.read'],
          allowUnscopedEducation: true,
        },
      },
    },
    async (request) => {
      const input = parse(institutionListQuerySchema, request.query);
      const visibleIds = await access.visibleInstitutionIds(request.identityPrincipal!.user.id);
      return service.list(input, visibleIds);
    },
  );
  app.post(
    '/api/institutions',
    {
      config: {
        access: {
          permissions: ['education.institutions.manage'],
          allowUnscopedEducation: true,
        },
      },
    },
    async (request, reply) => {
      const result = await service.create(
        parse(createInstitutionRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.get(
    '/api/institutions/:institutionId',
    {
      config: {
        access: {
          permissions: ['education.institutions.read'],
          education: {
            institutionParam: 'institutionId',
            permission: 'education.institutions.read',
          },
        },
      },
    },
    async (request) =>
      service.getInstitution(parse(institutionParamsSchema, request.params).institutionId),
  );
  app.patch(
    '/api/institutions/:institutionId',
    {
      config: {
        access: {
          permissions: ['education.institutions.manage'],
          education: {
            institutionParam: 'institutionId',
            permission: 'education.institutions.manage',
          },
        },
      },
    },
    async (request) =>
      service.update(
        parse(institutionParamsSchema, request.params).institutionId,
        parse(updateInstitutionRequestSchema, request.body),
        actor(request),
      ),
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function actor(request: FastifyRequest) {
  const user = request.identityPrincipal!.user;
  return auditContextFromRequest(request, {
    type: 'user',
    id: user.id,
    label: user.displayName ?? user.email ?? user.phone,
  });
}
