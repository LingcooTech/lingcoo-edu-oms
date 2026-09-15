import { ApiError } from '@lingcoo-tech/http';
import {
  createLessonOrderRequestSchema,
  createLessonOrderRefundRequestSchema,
  reviewLessonOrderRefundRequestSchema,
  cancelLessonOrderRefundRequestSchema,
  confirmOfflineLessonOrderRefundRequestSchema,
  createOfflineLessonOrderRequestSchema,
  createMiniStudentRequestSchema,
  idempotencyKeySchema,
  lessonOrderListQuerySchema,
  miniStudentListQuerySchema,
  retryLessonOrderGrantRequestSchema,
  refundLessonOrderRequestSchema,
  recordGroupOrderOfflineSettlementRequestSchema,
  startGroupOrderOnlinePaymentRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { LessonCommerceService } from '../application/lesson-commerce.service.js';

const orderParamsSchema = z.object({ orderId: z.uuid() });
const institutionParamsSchema = z.object({ institutionId: z.uuid() });
const institutionOrderParamsSchema = institutionParamsSchema.extend({ orderId: z.uuid() });
const institutionRefundParamsSchema = institutionParamsSchema.extend({ refundId: z.uuid() });
const packageQuerySchema = z.object({ institutionId: z.uuid() });

export async function registerLessonCommerceRoutes(
  app: FastifyInstance,
  service: LessonCommerceService,
) {
  const authenticated = { access: { authenticated: true } } as const;

  app.get('/api/mini/institutions', { config: authenticated }, async () =>
    service.listInstitutions(),
  );

  app.get('/api/mini/students', { config: authenticated }, async (request) =>
    service.listStudents(userId(request), parse(miniStudentListQuerySchema, request.query)),
  );
  app.post('/api/mini/students', { config: authenticated }, async (request, reply) => {
    const input = parse(createMiniStudentRequestSchema, request.body);
    const result = await service.onboardStudent(userId(request), input, actor(request));
    return reply.code(201).send(result);
  });
  app.get('/api/mini/lesson-packages', { config: authenticated }, async (request) =>
    service.listPackages(parse(packageQuerySchema, request.query).institutionId),
  );
  app.get('/api/mini/period-card-products', { config: authenticated }, async (request) =>
    service.listPeriodCards(parse(packageQuerySchema, request.query).institutionId),
  );
  app.get('/api/mini/orders', { config: authenticated }, async (request) =>
    service.listForGuardian(userId(request), parse(lessonOrderListQuerySchema, request.query)),
  );
  app.get('/api/mini/orders/:orderId', { config: authenticated }, async (request) =>
    service.getForGuardian(userId(request), parse(orderParamsSchema, request.params).orderId),
  );
  app.get('/api/mini/orders/:orderId/receipt', { config: authenticated }, async (request) =>
    service.receiptForGuardian(userId(request), parse(orderParamsSchema, request.params).orderId),
  );
  app.post('/api/mini/orders', { config: authenticated }, async (request, reply) => {
    const key = parse(idempotencyKeySchema, firstHeader(request.headers['idempotency-key']));
    const result = await service.createCheckout(
      userId(request),
      parse(createLessonOrderRequestSchema, request.body),
      key,
      actorWithId(request),
    );
    return reply.code(201).send(result);
  });
  app.post('/api/mini/orders/:orderId/actions/sync', { config: authenticated }, async (request) =>
    service.syncForGuardian(
      userId(request),
      parse(orderParamsSchema, request.params).orderId,
      actorWithId(request),
    ),
  );
  app.post(
    '/api/mini/orders/:orderId/actions/start-online-payment',
    { config: authenticated },
    async (request) =>
      service.startGroupOnlinePaymentForGuardian(
        userId(request),
        parse(orderParamsSchema, request.params).orderId,
        parse(startGroupOrderOnlinePaymentRequestSchema, request.body ?? {}),
        actorWithId(request),
      ),
  );

  app.get(
    '/api/institutions/:institutionId/orders',
    {
      config: {
        access: {
          permissions: ['education.orders.read'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.read' },
        },
      },
    },
    async (request) =>
      service.listForInstitution(
        parse(institutionParamsSchema, request.params).institutionId,
        parse(lessonOrderListQuerySchema, request.query),
      ),
  );
  app.post(
    '/api/institutions/:institutionId/orders/offline',
    {
      config: {
        access: {
          permissions: ['education.orders.manage'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
        },
      },
    },
    async (request, reply) => {
      const key = parse(idempotencyKeySchema, firstHeader(request.headers['idempotency-key']));
      const params = parse(institutionParamsSchema, request.params);
      const order = await service.createOfflineOrder(
        params.institutionId,
        parse(createOfflineLessonOrderRequestSchema, request.body),
        key,
        actorWithId(request),
      );
      return reply.code(201).send(order);
    },
  );
  app.get(
    '/api/institutions/:institutionId/orders/:orderId/receipt',
    {
      config: {
        access: {
          permissions: ['education.orders.read'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.read' },
        },
      },
    },
    async (request) => {
      const params = parse(institutionParamsSchema.extend({ orderId: z.uuid() }), request.params);
      return service.receiptForInstitution(params.institutionId, params.orderId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/orders/:orderId/actions/retry-grant',
    {
      config: {
        access: {
          permissions: ['education.orders.manage'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
        },
      },
    },
    async (request) => {
      parse(retryLessonOrderGrantRequestSchema, request.body ?? {});
      const params = parse(institutionParamsSchema.extend({ orderId: z.uuid() }), request.params);
      return service.retryGrant(params.institutionId, params.orderId, actorWithId(request));
    },
  );
  app.post(
    '/api/institutions/:institutionId/orders/:orderId/actions/start-online-payment',
    {
      config: {
        access: {
          permissions: ['education.orders.manage'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
        },
      },
    },
    async (request) => {
      const params = parse(institutionParamsSchema.extend({ orderId: z.uuid() }), request.params);
      return service.startGroupOnlinePaymentForInstitution(
        params.institutionId,
        params.orderId,
        parse(startGroupOrderOnlinePaymentRequestSchema, request.body ?? {}),
        actorWithId(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/orders/:orderId/actions/record-offline-settlement',
    {
      config: {
        access: {
          permissions: ['education.orders.manage'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
        },
      },
    },
    async (request) => {
      const params = parse(institutionParamsSchema.extend({ orderId: z.uuid() }), request.params);
      return service.recordGroupOfflineSettlement(
        params.institutionId,
        params.orderId,
        parse(recordGroupOrderOfflineSettlementRequestSchema, request.body),
        actorWithId(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/orders/:orderId/refunds',
    {
      config: {
        access: {
          permissions: ['education.orders.manage'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
        },
      },
    },
    async (request, reply) => {
      const params = parse(institutionOrderParamsSchema, request.params);
      return reply
        .code(201)
        .send(
          await service.requestRefund(
            params.institutionId,
            params.orderId,
            parse(createLessonOrderRefundRequestSchema, request.body),
            actorWithId(request),
          ),
        );
    },
  );
  app.get(
    '/api/institutions/:institutionId/orders/:orderId/refunds',
    {
      config: {
        access: {
          permissions: ['education.orders.read'],
          education: { institutionParam: 'institutionId', permission: 'education.orders.read' },
        },
      },
    },
    async (request) => {
      const params = parse(institutionOrderParamsSchema, request.params);
      return service.listRefundRequests(params.institutionId, params.orderId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/refunds/:refundId/actions/approve',
    { config: { access: refundManagementAccess() } },
    async (request) => {
      const params = parse(institutionRefundParamsSchema, request.params);
      return service.approveRefundRequest(
        params.institutionId,
        params.refundId,
        parse(reviewLessonOrderRefundRequestSchema, request.body),
        actorWithId(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/refunds/:refundId/actions/reject',
    { config: { access: refundManagementAccess() } },
    async (request) => {
      const params = parse(institutionRefundParamsSchema, request.params);
      return service.rejectRefundRequest(
        params.institutionId,
        params.refundId,
        parse(reviewLessonOrderRefundRequestSchema, request.body),
        actorWithId(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/refunds/:refundId/actions/cancel',
    { config: { access: refundManagementAccess() } },
    async (request) => {
      const params = parse(institutionRefundParamsSchema, request.params);
      return service.cancelRefundRequest(
        params.institutionId,
        params.refundId,
        parse(cancelLessonOrderRefundRequestSchema, request.body),
        actorWithId(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/refunds/:refundId/actions/confirm-offline',
    { config: { access: refundManagementAccess() } },
    async (request) => {
      const params = parse(institutionRefundParamsSchema, request.params);
      return service.confirmOfflineRefund(
        params.institutionId,
        params.refundId,
        parse(confirmOfflineLessonOrderRefundRequestSchema, request.body),
        actorWithId(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/orders/:orderId/actions/refund',
    {
      config: {
        access: {
          permissions: [
            'education.orders.manage',
            'education.lesson-balances.manage',
            'education.lesson-packages.manage',
          ],
          education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
        },
      },
    },
    async (request) => {
      const params = parse(institutionParamsSchema.extend({ orderId: z.uuid() }), request.params);
      return service.refundOrder(
        params.institutionId,
        params.orderId,
        parse(refundLessonOrderRequestSchema, request.body),
        actorWithId(request),
      );
    },
  );
}

function refundManagementAccess() {
  return {
    permissions: [
      'education.orders.manage',
      'education.lesson-balances.manage',
      'education.lesson-packages.manage',
    ],
    education: { institutionParam: 'institutionId', permission: 'education.orders.manage' },
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

function userId(request: FastifyRequest) {
  return request.identityPrincipal!.user.id;
}

function actor(request: FastifyRequest) {
  const user = request.identityPrincipal!.user;
  return auditContextFromRequest(request, {
    type: 'user',
    id: user.id,
    label: user.displayName ?? user.phone ?? user.email,
  });
}

function actorWithId(request: FastifyRequest) {
  return { ...actor(request), actorId: userId(request) };
}
