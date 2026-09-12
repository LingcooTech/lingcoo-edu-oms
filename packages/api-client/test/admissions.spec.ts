import { createAdmissionsApi, createApiClient } from '@lingcoo-edu-oms/api-client';
import { describe, expect, it, vi } from 'vitest';

const institutionId = '11111111-1111-4111-8111-111111111111';
const trialId = '22222222-2222-4222-8222-222222222222';
const leadId = '33333333-3333-4333-8333-333333333333';
const registrationId = '44444444-4444-4444-8444-444444444444';
const now = '2026-09-12T09:00:00.000Z';
const startsAt = '2026-09-14T01:00:00.000Z';

const lead = {
  id: leadId,
  guardianName: '陈女士',
  phone: '13800000000',
  studentName: '陈同学',
  grade: '三年级',
  source: 'wechat-mini',
  sourceDetail: null,
  ownerUserId: null,
  status: 'trial_booked',
  nextFollowUpAt: null,
  convertedStudentId: null,
  revision: 2,
  createdAt: now,
  updatedAt: now,
};

const trial = {
  id: trialId,
  institutionId,
  campusId: null,
  courseId: null,
  teacherId: null,
  title: '周末成长试听课',
  startsAt,
  endsAt: '2026-09-14T02:00:00.000Z',
  capacity: 8,
  bookedCount: 1,
  reservationFeeAmountMinor: 0,
  reservationHoldMinutes: 15,
  reservationRefundCutoffHours: 12,
  status: 'open',
  notes: null,
  revision: 2,
  createdAt: now,
  updatedAt: now,
};

const registration = {
  id: registrationId,
  trialSessionId: trialId,
  leadId,
  institutionId,
  trialTitleSnapshot: trial.title,
  trialStartsAtSnapshot: startsAt,
  status: 'booked',
  guardianNameSnapshot: lead.guardianName,
  phoneSnapshot: lead.phone,
  studentNameSnapshot: lead.studentName,
  gradeSnapshot: lead.grade,
  payerIdentityUserId: '55555555-5555-4555-8555-555555555555',
  orderNo: null,
  receiptNo: null,
  amountMinor: 0,
  currency: 'CNY',
  provider: null,
  paymentIntentId: null,
  paymentStatus: 'not_required',
  expiresAt: null,
  paidAt: null,
  refundCutoffAt: null,
  checkedInAt: null,
  cancelledAt: null,
  notes: null,
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('admissions mini trial reservation api', () => {
  it('lists trials and creates an idempotent reservation checkout', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ items: [trial], page: 1, pageSize: 20, total: 1 }))
      .mockResolvedValueOnce(response({ lead, trial, registration, payment: null }));
    const api = createAdmissionsApi(createApiClient({ fetch }));

    const page = await api.listMiniTrials({ institutionId, page: 1, pageSize: 20 });
    const checkout = await api.createMiniTrialReservation(
      trialId,
      {
        guardianName: lead.guardianName,
        phone: lead.phone,
        studentName: lead.studentName,
        grade: lead.grade,
        provider: 'mock',
      },
      'reservation-idempotency-key',
    );

    expect(page.items[0]?.reservationFeeAmountMinor).toBe(0);
    expect(checkout.registration.status).toBe('booked');
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `/api/mini/admissions/trials?page=1&pageSize=20&institutionId=${institutionId}`,
    );
    expect(fetch.mock.calls[1]?.[0]).toBe(`/api/mini/admissions/trials/${trialId}/reservations`);
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('idempotency-key')).toBe(
      'reservation-idempotency-key',
    );
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      guardianName: lead.guardianName,
      phone: lead.phone,
      studentName: lead.studentName,
      source: 'wechat-mini',
      provider: 'mock',
    });
  });
});
