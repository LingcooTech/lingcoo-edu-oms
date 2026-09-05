import { Readable } from 'node:stream';

import { ApiError } from '@lingcoo-tech/http';
import {
  createPaymentIntentRequestSchema,
  createPaymentRefundRequestSchema,
  mockPaymentCallbackRequestSchema,
  paymentCallbackQuerySchema,
  paymentIntentQuerySchema,
  paymentRefundQuerySchema,
  paymentTransactionQuerySchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { PaymentsService } from '../application/payments.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

export async function registerPaymentRoutes(app: FastifyInstance, service: PaymentsService) {
  app.get(
    '/api/payments/intents',
    { config: { access: { permissions: ['payments.read'] } } },
    async (request) => service.listIntents(parse(paymentIntentQuerySchema, request.query)),
  );
  app.get(
    '/api/payments/intents/:id',
    { config: { access: { permissions: ['payments.read'] } } },
    async (request) => service.getIntent(parse(idParamsSchema, request.params).id),
  );
  app.post(
    '/api/payments/intents',
    { config: { access: { permissions: ['payments.manage'] } } },
    async (request) =>
      service.createIntent(parse(createPaymentIntentRequestSchema, request.body), actor(request)),
  );
  app.post(
    '/api/payments/intents/:id/actions/close',
    { config: { access: { permissions: ['payments.manage'] } } },
    async (request) => service.close(parse(idParamsSchema, request.params).id, actor(request)),
  );
  app.post(
    '/api/payments/intents/:id/actions/reconcile',
    { config: { access: { permissions: ['payments.manage'] } } },
    async (request) => service.reconcile(parse(idParamsSchema, request.params).id, actor(request)),
  );
  app.post(
    '/api/payments/intents/:id/refunds',
    { config: { access: { permissions: ['payments.manage'] } } },
    async (request) =>
      service.refund(
        parse(idParamsSchema, request.params).id,
        parse(createPaymentRefundRequestSchema, request.body),
        actor(request),
      ),
  );
  app.get(
    '/api/payments/transactions',
    { config: { access: { permissions: ['payments.read'] } } },
    async (request) =>
      service.listTransactions(parse(paymentTransactionQuerySchema, request.query)),
  );
  app.get(
    '/api/payments/refunds',
    { config: { access: { permissions: ['payments.read'] } } },
    async (request) => service.listRefunds(parse(paymentRefundQuerySchema, request.query)),
  );
  app.get(
    '/api/payments/callbacks',
    { config: { access: { permissions: ['payments.read'] } } },
    async (request) => service.listCallbacks(parse(paymentCallbackQuerySchema, request.query)),
  );
  app.post(
    '/api/payments/providers/mock/callback',
    {
      config: { access: { public: true }, rateLimit: { max: 120, timeWindow: '1 minute' } },
      preParsing: captureRawBody,
    },
    async (request) =>
      service.callback(
        parse(mockPaymentCallbackRequestSchema, request.body),
        firstHeader(request.headers['x-payment-signature']),
        (request as FastifyRequest & { paymentRawBody: Buffer }).paymentRawBody,
        auditContextFromRequest(request, { type: 'provider', label: 'mock' }),
      ),
  );
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  return result.data;
}

function actor(request: FastifyRequest) {
  const user = request.identityPrincipal!.user;
  return {
    ...auditContextFromRequest(request, {
      type: 'user' as const,
      id: user.id,
      label: user.displayName ?? user.email,
    }),
    actorId: user.id,
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function captureRawBody(
  request: FastifyRequest,
  _reply: unknown,
  payload: AsyncIterable<Buffer>,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks);
  (request as FastifyRequest & { paymentRawBody: Buffer }).paymentRawBody = rawBody;
  return Readable.from(rawBody);
}
