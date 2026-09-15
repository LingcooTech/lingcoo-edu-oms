import { ApiError } from '@lingcoo-tech/http';
import {
  addGroupMatchingEnrollmentRequestSchema,
  cancelGroupMatchingCampaignRequestSchema,
  confirmGroupMatchingFormationRequestSchema,
  createGroupMatchingCampaignRequestSchema,
  groupMatchingCampaignListQuerySchema,
  idempotencyKeySchema,
  publishGroupMatchingCampaignRequestSchema,
  recordGroupMatchingDepositRequestSchema,
  recordGroupMatchingDepositRefundRequestSchema,
  updateGroupMatchingCampaignRequestSchema,
  withdrawGroupMatchingEnrollmentRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { GroupMatchingService } from '../application/group-matching.service.js';

const institutionParams = z.object({ institutionId: z.uuid() });
const campaignParams = institutionParams.extend({ campaignId: z.uuid() });
const enrollmentParams = campaignParams.extend({ enrollmentId: z.uuid() });

export async function registerGroupMatchingRoutes(
  app: FastifyInstance,
  service: GroupMatchingService,
) {
  app.get(
    '/api/institutions/:institutionId/group-matching/campaigns',
    { config: { access: educationAccess('education.enrollments.read') } },
    async (request) => {
      const params = parse(institutionParams, request.params);
      return service.list(
        params.institutionId,
        parse(groupMatchingCampaignListQuerySchema, request.query),
      );
    },
  );
  app.get(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId',
    { config: { access: educationAccess('education.enrollments.read') } },
    async (request) => {
      const params = parse(campaignParams, request.params);
      return service.get(params.institutionId, params.campaignId);
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request, reply) => {
      const params = parse(institutionParams, request.params);
      return reply
        .code(201)
        .send(
          await service.create(
            params.institutionId,
            parse(createGroupMatchingCampaignRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/enrollments/:enrollmentId/actions/refund-deposit',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request) => {
      const params = parse(enrollmentParams, request.params);
      return service.recordDepositRefund(
        params.institutionId,
        params.campaignId,
        params.enrollmentId,
        parse(recordGroupMatchingDepositRefundRequestSchema, request.body),
        idempotencyKey(request),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/enrollments/:enrollmentId/actions/withdraw',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request) => {
      const params = parse(enrollmentParams, request.params);
      return service.withdrawEnrollment(
        params.institutionId,
        params.campaignId,
        params.enrollmentId,
        parse(withdrawGroupMatchingEnrollmentRequestSchema, request.body),
        idempotencyKey(request),
        actor(request),
      );
    },
  );
  app.patch(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request) => {
      const params = parse(campaignParams, request.params);
      return service.update(
        params.institutionId,
        params.campaignId,
        parse(updateGroupMatchingCampaignRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/actions/publish',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request) => {
      const params = parse(campaignParams, request.params);
      return service.publish(
        params.institutionId,
        params.campaignId,
        parse(publishGroupMatchingCampaignRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/enrollments',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request, reply) => {
      const params = parse(campaignParams, request.params);
      return reply
        .code(201)
        .send(
          await service.addEnrollment(
            params.institutionId,
            params.campaignId,
            parse(addGroupMatchingEnrollmentRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/enrollments/:enrollmentId/deposit',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request) => {
      const params = parse(enrollmentParams, request.params);
      return service.recordDeposit(
        params.institutionId,
        params.campaignId,
        params.enrollmentId,
        parse(recordGroupMatchingDepositRequestSchema, request.body),
        actor(request),
      );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/formation',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request, reply) => {
      const params = parse(campaignParams, request.params);
      return reply
        .code(201)
        .send(
          await service.confirmFormation(
            params.institutionId,
            params.campaignId,
            parse(confirmGroupMatchingFormationRequestSchema, request.body),
            actor(request),
          ),
        );
    },
  );
  app.post(
    '/api/institutions/:institutionId/group-matching/campaigns/:campaignId/actions/cancel',
    { config: { access: educationAccess('education.enrollments.manage') } },
    async (request) => {
      const params = parse(campaignParams, request.params);
      return service.cancel(
        params.institutionId,
        params.campaignId,
        parse(cancelGroupMatchingCampaignRequestSchema, request.body),
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
