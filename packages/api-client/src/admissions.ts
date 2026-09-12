import {
  admissionLeadListQuerySchema,
  admissionLeadPageSchema,
  admissionFollowUpSchema,
  admissionLeadSchema,
  admissionTrialListQuerySchema,
  admissionTrialPageSchema,
  admissionTrialRegistrationSchema,
  admissionTrialRegistrationListSchema,
  admissionTrialReservationReceiptSchema,
  admissionTrialSessionSchema,
  bookAdmissionTrialRequestSchema,
  checkInAdmissionTrialRequestSchema,
  convertAdmissionLeadRequestSchema,
  createAdmissionFollowUpRequestSchema,
  createAdmissionLeadRequestSchema,
  createAdmissionTrialRequestSchema,
  createMiniAdmissionTrialReservationRequestSchema,
  miniAdmissionTrialReservationCheckoutSchema,
  updateAdmissionLeadRequestSchema,
  updateAdmissionTrialRequestSchema,
  type AdmissionLeadListQuery,
  type AdmissionTrialListQuery,
  type BookAdmissionTrialRequest,
  type CheckInAdmissionTrialRequest,
  type ConvertAdmissionLeadRequest,
  type CreateAdmissionFollowUpRequest,
  type CreateAdmissionLeadRequest,
  type CreateAdmissionTrialRequest,
  type CreateMiniAdmissionTrialReservationRequest,
  type UpdateAdmissionLeadRequest,
  type UpdateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';

import { idSchema } from '@lingcoo-edu-oms/contracts';
import { z } from 'zod';
import type { ApiClient } from './client.js';

function queryString(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function leadPath(leadId: string): string {
  return `/api/admissions/leads/${pathId(leadId)}`;
}

function trialPath(trialId: string): string {
  return `/api/admissions/trials/${pathId(trialId)}`;
}

function miniRegistrationPath(registrationId: string): string {
  return `/api/mini/admissions/trial-reservations/${pathId(registrationId)}`;
}

export function createAdmissionsApi(client: ApiClient) {
  return {
    listLeads(input: Partial<AdmissionLeadListQuery> = {}) {
      const query = admissionLeadListQuerySchema.parse(input);
      return client.request({
        path: `/api/admissions/leads${queryString(query)}`,
        schema: admissionLeadPageSchema,
      });
    },
    getLead(leadId: string) {
      return client.request({ path: leadPath(leadId), schema: admissionLeadSchema });
    },
    createLead(input: CreateAdmissionLeadRequest) {
      return client.request({
        method: 'POST',
        path: '/api/admissions/leads',
        body: createAdmissionLeadRequestSchema.parse(input),
        schema: admissionLeadSchema,
      });
    },
    updateLead(leadId: string, input: UpdateAdmissionLeadRequest) {
      return client.request({
        method: 'PATCH',
        path: leadPath(leadId),
        body: updateAdmissionLeadRequestSchema.parse(input),
        schema: admissionLeadSchema,
      });
    },
    listFollowUps(leadId: string) {
      return client.request({
        path: `${leadPath(leadId)}/follow-ups`,
        schema: z.object({ items: admissionFollowUpSchema.array() }),
      });
    },
    addFollowUp(leadId: string, input: CreateAdmissionFollowUpRequest) {
      return client.request({
        method: 'POST',
        path: `${leadPath(leadId)}/follow-ups`,
        body: createAdmissionFollowUpRequestSchema.parse(input),
        schema: z.object({ followUp: admissionFollowUpSchema, lead: admissionLeadSchema }),
      });
    },
    bookTrial(leadId: string, input: BookAdmissionTrialRequest) {
      return client.request({
        method: 'POST',
        path: `${leadPath(leadId)}/trial-bookings`,
        body: bookAdmissionTrialRequestSchema.parse(input),
        schema: z.object({
          lead: admissionLeadSchema,
          trial: admissionTrialSessionSchema,
          registration: admissionTrialRegistrationSchema,
        }),
      });
    },
    convertLead(leadId: string, input: ConvertAdmissionLeadRequest) {
      return client.request({
        method: 'POST',
        path: `${leadPath(leadId)}/convert`,
        body: convertAdmissionLeadRequestSchema.parse(input),
        schema: z.object({
          lead: admissionLeadSchema,
          student: z.unknown(),
          guardian: z.unknown(),
        }),
      });
    },
    listTrials(input: Partial<AdmissionTrialListQuery> = {}) {
      const query = admissionTrialListQuerySchema.parse(input);
      return client.request({
        path: `/api/admissions/trials${queryString(query)}`,
        schema: admissionTrialPageSchema,
      });
    },
    listMiniTrials(input: Partial<AdmissionTrialListQuery> = {}) {
      const query = admissionTrialListQuerySchema.parse(input);
      return client.request({
        path: `/api/mini/admissions/trials${queryString(query)}`,
        schema: admissionTrialPageSchema,
      });
    },
    createMiniTrialReservation(
      trialId: string,
      input: CreateMiniAdmissionTrialReservationRequest,
      idempotencyKey: string,
    ) {
      return client.request({
        method: 'POST',
        path: `/api/mini/admissions/trials/${pathId(trialId)}/reservations`,
        headers: { 'idempotency-key': idempotencyKey },
        body: createMiniAdmissionTrialReservationRequestSchema.parse(input),
        schema: miniAdmissionTrialReservationCheckoutSchema,
      });
    },
    getMiniTrialReservation(registrationId: string) {
      return client.request({
        path: miniRegistrationPath(registrationId),
        schema: admissionTrialRegistrationSchema,
      });
    },
    syncMiniTrialReservation(registrationId: string) {
      return client.request({
        method: 'POST',
        path: `${miniRegistrationPath(registrationId)}/actions/sync`,
        schema: admissionTrialRegistrationSchema,
      });
    },
    getMiniTrialReservationReceipt(registrationId: string) {
      return client.request({
        path: `${miniRegistrationPath(registrationId)}/receipt`,
        schema: admissionTrialReservationReceiptSchema,
      });
    },
    createTrial(input: CreateAdmissionTrialRequest) {
      return client.request({
        method: 'POST',
        path: '/api/admissions/trials',
        body: createAdmissionTrialRequestSchema.parse(input),
        schema: admissionTrialSessionSchema,
      });
    },
    updateTrial(trialId: string, input: UpdateAdmissionTrialRequest) {
      return client.request({
        method: 'PATCH',
        path: trialPath(trialId),
        body: updateAdmissionTrialRequestSchema.parse(input),
        schema: admissionTrialSessionSchema,
      });
    },
    listRegistrations(trialId: string) {
      return client.request({
        path: `${trialPath(trialId)}/registrations`,
        schema: admissionTrialRegistrationListSchema,
      });
    },
    checkIn(trialId: string, leadId: string, input?: CheckInAdmissionTrialRequest) {
      return client.request({
        method: 'POST',
        path: `${trialPath(trialId)}/registrations/${pathId(leadId)}/check-in`,
        body: checkInAdmissionTrialRequestSchema.parse(input ?? { notes: null }),
        schema: z.object({
          registration: admissionTrialRegistrationSchema,
          lead: admissionLeadSchema,
        }),
      });
    },
  };
}

export type AdmissionsApi = ReturnType<typeof createAdmissionsApi>;
