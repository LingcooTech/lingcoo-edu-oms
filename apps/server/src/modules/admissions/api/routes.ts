import { ApiError } from '@lingcoo-tech/http';
import {
  admissionLeadListQuerySchema,
  bookAdmissionTrialRequestSchema,
  checkInAdmissionTrialRequestSchema,
  convertAdmissionLeadRequestSchema,
  createAdmissionFollowUpRequestSchema,
  createAdmissionLeadRequestSchema,
  createAdmissionTrialRequestSchema,
  createMiniAdmissionTrialReservationRequestSchema,
  idempotencyKeySchema,
  admissionTrialListQuerySchema,
  updateAdmissionLeadRequestSchema,
  updateAdmissionTrialRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { AdmissionsService } from '../application/admissions.service.js';

const leadParams = z.object({ leadId: z.uuid() });
const trialParams = z.object({ trialSessionId: z.uuid() });
const registrationParams = z.object({ registrationId: z.uuid() });

export async function registerAdmissionsRoutes(app: FastifyInstance, service: AdmissionsService) {
  const access = { permissions: ['education.leads.read'], allowUnscopedEducation: true } as const;
  const manage = { permissions: ['education.leads.manage'], allowUnscopedEducation: true } as const;
  app.get('/api/admissions/leads', { config: { access } }, async (request) =>
    service.listLeads(parse(admissionLeadListQuerySchema, request.query)),
  );
  app.get('/api/admissions/leads/:leadId', { config: { access } }, async (request) =>
    service.getLead(parse(leadParams, request.params).leadId),
  );
  app.post('/api/admissions/leads', { config: { access: manage } }, async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.createLead(
          parse(createAdmissionLeadRequestSchema, request.body),
          actor(request),
        ),
      ),
  );
  app.patch('/api/admissions/leads/:leadId', { config: { access: manage } }, async (request) =>
    service.updateLead(
      parse(leadParams, request.params).leadId,
      parse(updateAdmissionLeadRequestSchema, request.body),
      actor(request),
    ),
  );
  app.get('/api/admissions/leads/:leadId/follow-ups', { config: { access } }, async (request) =>
    service.followUps(parse(leadParams, request.params).leadId),
  );
  app.post(
    '/api/admissions/leads/:leadId/follow-ups',
    { config: { access: manage } },
    async (request) =>
      service.addFollowUp(
        parse(leadParams, request.params).leadId,
        parse(createAdmissionFollowUpRequestSchema, request.body),
        actor(request),
      ),
  );
  app.post(
    '/api/admissions/leads/:leadId/trial-bookings',
    { config: { access: manage } },
    async (request) =>
      service.bookTrial(
        parse(leadParams, request.params).leadId,
        parse(bookAdmissionTrialRequestSchema, request.body).trialSessionId,
        actor(request),
      ),
  );
  app.post(
    '/api/admissions/leads/:leadId/convert',
    { config: { access: manage } },
    async (request) =>
      service.convertLead(
        parse(leadParams, request.params).leadId,
        parse(convertAdmissionLeadRequestSchema, request.body),
        actor(request),
      ),
  );
  app.get('/api/admissions/trials', { config: { access } }, async (request) =>
    service.listTrials(parse(admissionTrialListQuerySchema, request.query)),
  );
  app.post('/api/admissions/trials', { config: { access: manage } }, async (request, reply) =>
    reply
      .code(201)
      .send(
        await service.createTrial(
          parse(createAdmissionTrialRequestSchema, request.body),
          actor(request),
        ),
      ),
  );
  app.patch(
    '/api/admissions/trials/:trialSessionId',
    { config: { access: manage } },
    async (request) =>
      service.updateTrial(
        parse(trialParams, request.params).trialSessionId,
        parse(updateAdmissionTrialRequestSchema, request.body),
        actor(request),
      ),
  );
  app.get(
    '/api/admissions/trials/:trialSessionId/registrations',
    { config: { access } },
    async (request) => service.registrations(parse(trialParams, request.params).trialSessionId),
  );
  app.post(
    '/api/admissions/trials/:trialSessionId/registrations/:leadId/check-in',
    { config: { access: manage } },
    async (request) =>
      service.checkIn(
        parse(z.object({ trialSessionId: z.uuid(), leadId: z.uuid() }), request.params).leadId,
        parse(z.object({ trialSessionId: z.uuid(), leadId: z.uuid() }), request.params)
          .trialSessionId,
        parse(checkInAdmissionTrialRequestSchema, request.body).notes,
        actor(request),
      ),
  );

  const authenticated = { access: { authenticated: true } } as const;
  app.get('/api/mini/admissions/trials', { config: authenticated }, async (request) =>
    service.listMiniTrials(parse(admissionTrialListQuerySchema, request.query)),
  );
  app.post(
    '/api/mini/admissions/trials/:trialSessionId/reservations',
    { config: authenticated },
    async (request, reply) => {
      const key = parse(idempotencyKeySchema, firstHeader(request.headers['idempotency-key']));
      const result = await service.createReservationCheckout(
        userId(request),
        parse(trialParams, request.params).trialSessionId,
        parse(createMiniAdmissionTrialReservationRequestSchema, request.body),
        key,
        actorWithId(request),
      );
      return reply.code(201).send(result);
    },
  );
  app.get(
    '/api/mini/admissions/trial-reservations/:registrationId',
    { config: authenticated },
    async (request) =>
      service.getReservation(
        userId(request),
        parse(registrationParams, request.params).registrationId,
      ),
  );
  app.post(
    '/api/mini/admissions/trial-reservations/:registrationId/actions/sync',
    { config: authenticated },
    async (request) =>
      service.syncReservation(
        userId(request),
        parse(registrationParams, request.params).registrationId,
        actorWithId(request),
      ),
  );
  app.get(
    '/api/mini/admissions/trial-reservations/:registrationId/receipt',
    { config: authenticated },
    async (request) =>
      service.receiptForReservation(
        userId(request),
        parse(registrationParams, request.params).registrationId,
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
  return auditContextFromRequest(request, {
    type: 'user',
    id: user.id,
    label: user.displayName ?? user.email ?? user.phone,
  });
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function userId(request: FastifyRequest) {
  return request.identityPrincipal!.user.id;
}

function actorWithId(request: FastifyRequest) {
  return { ...actor(request), actorId: userId(request) };
}
