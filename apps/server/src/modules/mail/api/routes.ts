import { ApiError } from '@lingcoo-tech/http';
import {
  mailDeliveryQuerySchema,
  resetMailTemplateRequestSchema,
  sendTestMailRequestSchema,
  updateMailTemplateRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { MailService } from '../application/mail.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
const keyParamsSchema = z.object({ key: z.string().trim().min(1).max(120) });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  return result.data;
}
function actor(request: Parameters<typeof auditContextFromRequest>[0]) {
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

export async function registerMailRoutes(app: FastifyInstance, service: MailService) {
  app.get(
    '/api/mail/deliveries',
    { config: { access: { permissions: ['mail.read'] } } },
    async (request) => service.listDeliveries(parse(mailDeliveryQuerySchema, request.query)),
  );
  app.get(
    '/api/mail/deliveries/:id',
    { config: { access: { permissions: ['mail.read'] } } },
    async (request) => service.getDelivery(parse(idParamsSchema, request.params).id),
  );
  app.get('/api/mail/templates', { config: { access: { permissions: ['mail.read'] } } }, async () =>
    service.listTemplates(),
  );
  app.get(
    '/api/mail/templates/:key',
    { config: { access: { permissions: ['mail.read'] } } },
    async (request) => service.getTemplate(parse(keyParamsSchema, request.params).key),
  );
  app.put(
    '/api/mail/templates/:key',
    { config: { access: { permissions: ['mail.manage'] } } },
    async (request) =>
      service.updateTemplate(
        parse(keyParamsSchema, request.params).key,
        parse(updateMailTemplateRequestSchema, request.body),
        actor(request),
      ),
  );
  app.delete(
    '/api/mail/templates/:key',
    { config: { access: { permissions: ['mail.manage'] } } },
    async (request) =>
      service.resetTemplate(
        parse(keyParamsSchema, request.params).key,
        parse(resetMailTemplateRequestSchema, request.body),
        actor(request),
      ),
  );
  app.post(
    '/api/mail/actions/test',
    { config: { access: { permissions: ['mail.manage'] } } },
    async (request) =>
      service.sendTest(parse(sendTestMailRequestSchema, request.body), actor(request)),
  );
}
