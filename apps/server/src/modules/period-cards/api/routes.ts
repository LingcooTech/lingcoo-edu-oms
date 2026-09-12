import { ApiError } from '@lingcoo-tech/http';
import {
  createPeriodCardProductRequestSchema,
  idempotencyKeySchema,
  issuePeriodCardEntitlementRequestSchema,
  periodCardEntitlementListQuerySchema,
  periodCardProductListQuerySchema,
  periodCardUsageListQuerySchema,
  reversePeriodCardUsageRequestSchema,
  revokePeriodCardEntitlementRequestSchema,
  updatePeriodCardProductRequestSchema,
  usePeriodCardRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { PeriodCardsService } from '../application/period-cards.service.js';

const institutionParams = z.object({ institutionId: z.uuid() });
const productParams = institutionParams.extend({ productId: z.uuid() });
const entitlementParams = institutionParams.extend({ entitlementId: z.uuid() });
const usageParams = institutionParams.extend({ usageId: z.uuid() });

export async function registerPeriodCardsRoutes(app: FastifyInstance, service: PeriodCardsService) {
  app.get(
    '/api/institutions/:institutionId/period-card-products',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listProducts(
        params.institutionId,
        parse(periodCardProductListQuerySchema, request.query),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/period-card-products/:productId',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) => {
      const params = parse(productParams, request.params);
      return service.getProduct(params.institutionId, params.productId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/period-card-products',
    { config: { access: educationAccess('education.lesson-packages.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      const result = await service.createProduct(
        params.institutionId,
        parse(createPeriodCardProductRequestSchema, request.body),
        idempotencyKey(request),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.patch(
    '/api/institutions/:institutionId/period-card-products/:productId',
    { config: { access: educationAccess('education.lesson-packages.manage') } },
    async (request) => {
      const params = parse(productParams, request.params);
      return service.updateProduct(
        params.institutionId,
        params.productId,
        parse(updatePeriodCardProductRequestSchema, request.body),
        idempotencyKey(request),
        actor(request),
      );
    },
  );

  app.get(
    '/api/institutions/:institutionId/period-card-entitlements',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listEntitlements(
        params.institutionId,
        parse(periodCardEntitlementListQuerySchema, request.query),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/period-card-entitlements/:entitlementId',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) => {
      const params = parse(entitlementParams, request.params);
      return service.getEntitlement(params.institutionId, params.entitlementId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/period-card-entitlements',
    { config: { access: educationAccess('education.lesson-packages.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      const result = await service.issue(
        params.institutionId,
        parse(issuePeriodCardEntitlementRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.post(
    '/api/institutions/:institutionId/period-card-entitlements/:entitlementId/revoke',
    { config: { access: educationAccess('education.lesson-packages.manage') } },
    async (request) => {
      const params = parse(entitlementParams, request.params);
      return service.revoke(
        params.institutionId,
        params.entitlementId,
        parse(revokePeriodCardEntitlementRequestSchema, request.body),
        actor(request),
      );
    },
  );

  app.get(
    '/api/institutions/:institutionId/period-card-usages',
    { config: { access: educationAccess('education.lesson-packages.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.listUsages(
        params.institutionId,
        parse(periodCardUsageListQuerySchema, request.query),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/period-card-usages',
    { config: { access: educationAccess('education.attendance.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      const result = await service.use(
        params.institutionId,
        parse(usePeriodCardRequestSchema, request.body),
        actor(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.post(
    '/api/institutions/:institutionId/period-card-usages/:usageId/reverse',
    { config: { access: educationAccess('education.attendance.manage') } },
    async (request) => {
      const params = parse(usageParams, request.params);
      return service.reverse(
        params.institutionId,
        params.usageId,
        parse(reversePeriodCardUsageRequestSchema, request.body),
        actor(request),
      );
    },
  );
}

function educationAccess(permission: string) {
  return {
    permissions: [permission],
    education: { institutionParam: 'institutionId', permission },
  } as const;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function idempotencyKey(request: FastifyRequest): string {
  return parse(idempotencyKeySchema, firstHeader(request.headers['idempotency-key']));
}

function actor(request: FastifyRequest) {
  const user = request.identityPrincipal!.user;
  return {
    ...auditContextFromRequest(request, {
      type: 'user' as const,
      id: user.id,
      label: user.displayName ?? user.email ?? user.phone,
    }),
    actorId: user.id,
  };
}
