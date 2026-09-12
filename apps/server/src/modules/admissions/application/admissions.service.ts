import { randomBytes } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  miniAdmissionTrialReservationCheckoutSchema,
  type AdmissionFollowUp,
  type AdmissionLead,
  type AdmissionLeadListQuery,
  type AdmissionTrialListQuery,
  type AdmissionTrialRegistration,
  type AdmissionTrialReservationReceipt,
  type AdmissionTrialSession,
  type CreateAdmissionFollowUpRequest,
  type CreateAdmissionLeadRequest,
  type CreateAdmissionTrialRequest,
  type CreateMiniAdmissionTrialReservationRequest,
  type MiniAdmissionTrialReservationCheckout,
  type PaymentIntentDetail,
  type PaymentProvider,
  type UpdateAdmissionLeadRequest,
  type UpdateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { IdempotencyService } from '../../idempotency/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { PaymentFact, PaymentFactReceiver } from '../../payments/public.js';
import type { StudentOnboardingDirectory } from '../../people/public.js';
import type {
  AdmissionReservationPayerDirectory,
  AdmissionReservationPayments,
} from '../domain/model.js';
import {
  AdmissionsRepository,
  type AdmissionFollowUpRecord,
  type AdmissionLeadRecord,
  type AdmissionRegistrationRecord,
  type AdmissionTrialRecord,
} from '../infrastructure/persistence/admissions.repository.js';

type ActorContext = AuditContext & { actorId: string };

export class AdmissionsService implements PaymentFactReceiver {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: AdmissionsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly people: StudentOnboardingDirectory,
    private readonly payments: AdmissionReservationPayments,
    private readonly payers: AdmissionReservationPayerDirectory,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async listLeads(input: AdmissionLeadListQuery) {
    const result = await this.repository.listLeads(input);
    return {
      items: result.items.map(this.leadView),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async getLead(id: string): Promise<AdmissionLead> {
    const record = await this.repository.findLead(id);
    if (!record) throw new ApiError(404, 'ADMISSION_LEAD_NOT_FOUND', '线索不存在');
    return this.leadView(record);
  }

  async createLead(input: CreateAdmissionLeadRequest, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const record = await this.repository.createLead(input, transaction);
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-lead.created',
          resourceType: 'admission.lead',
          resourceId: record.id,
          changes: [
            { field: 'studentName', before: null, after: record.studentName },
            { field: 'source', before: null, after: record.source },
          ],
        },
        transaction,
      );
      return this.leadView(record);
    });
  }

  async updateLead(id: string, input: UpdateAdmissionLeadRequest, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.findLead(id, transaction);
      if (!before) throw new ApiError(404, 'ADMISSION_LEAD_NOT_FOUND', '线索不存在');
      const record = await this.repository.updateLead(
        id,
        {
          ...input,
          nextFollowUpAt:
            input.nextFollowUpAt === undefined
              ? undefined
              : input.nextFollowUpAt
                ? new Date(input.nextFollowUpAt)
                : null,
        },
        transaction,
      );
      if (!record)
        throw new ApiError(409, 'ADMISSION_LEAD_VERSION_CONFLICT', '线索已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-lead.updated',
          resourceType: 'admission.lead',
          resourceId: id,
          changes: Object.entries(input)
            .filter(([field]) => field !== 'expectedRevision')
            .map(([field, after]) => ({
              field,
              before: before[field as keyof AdmissionLeadRecord] ?? null,
              after: after ?? null,
            })),
        },
        transaction,
      );
      return this.leadView(record);
    });
  }

  async followUps(id: string): Promise<{ items: AdmissionFollowUp[] }> {
    const lead = await this.repository.findLead(id);
    if (!lead) throw new ApiError(404, 'ADMISSION_LEAD_NOT_FOUND', '线索不存在');
    return { items: (await this.repository.listFollowUps(id)).map(this.followUpView) };
  }

  async addFollowUp(id: string, input: CreateAdmissionFollowUpRequest, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const lead = await this.repository.findLead(id, transaction);
      if (!lead) throw new ApiError(404, 'ADMISSION_LEAD_NOT_FOUND', '线索不存在');
      const nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
      const followUp = await this.repository.createFollowUp(
        { leadId: id, content: input.content, nextFollowUpAt, createdBy: context.actorId! },
        transaction,
      );
      const updated = await this.repository.updateLead(
        id,
        { expectedRevision: lead.revision, nextFollowUpAt, status: 'nurture' },
        transaction,
      );
      if (!updated)
        throw new ApiError(409, 'ADMISSION_LEAD_VERSION_CONFLICT', '线索已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-follow-up.created',
          resourceType: 'admission.follow-up',
          resourceId: followUp.id,
          changes: [{ field: 'leadId', before: null, after: id }],
        },
        transaction,
      );
      return { followUp: this.followUpView(followUp), lead: this.leadView(updated) };
    });
  }

  async listTrials(input: AdmissionTrialListQuery) {
    return this.trialPage(await this.repository.listTrials(input), input);
  }

  async listMiniTrials(input: AdmissionTrialListQuery) {
    return this.trialPage(await this.repository.listOpenFutureTrials(input, this.clock()), input);
  }

  async createTrial(input: CreateAdmissionTrialRequest, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      await this.institutions.assertActiveInstitution(input.institutionId, transaction);
      if (new Date(input.endsAt) <= new Date(input.startsAt))
        throw new ApiError(422, 'ADMISSION_TRIAL_TIME_INVALID', '试听结束时间必须晚于开始时间');
      const record = await this.repository.createTrial(input, transaction);
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-trial.created',
          resourceType: 'admission.trial-session',
          resourceId: record.id,
          changes: [
            { field: 'institutionId', before: null, after: record.institutionId },
            { field: 'startsAt', before: null, after: record.startsAt.toISOString() },
            {
              field: 'reservationFeeAmountMinor',
              before: null,
              after: record.reservationFeeAmountMinor,
            },
          ],
        },
        transaction,
      );
      return this.trialView(record);
    });
  }

  async updateTrial(id: string, input: UpdateAdmissionTrialRequest, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.lockTrial(id, transaction);
      if (!before) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
      if (
        input.institutionId &&
        input.institutionId !== before.institutionId &&
        before.bookedCount > 0
      )
        throw new ApiError(409, 'ADMISSION_TRIAL_INSTITUTION_LOCKED', '已有报名时不能变更所属机构');
      if (input.institutionId)
        await this.institutions.assertActiveInstitution(input.institutionId, transaction);
      const startsAt = input.startsAt ? new Date(input.startsAt) : before.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : before.endsAt;
      if (endsAt <= startsAt)
        throw new ApiError(422, 'ADMISSION_TRIAL_TIME_INVALID', '试听结束时间必须晚于开始时间');
      if (input.capacity !== undefined && input.capacity < before.bookedCount)
        throw new ApiError(409, 'ADMISSION_TRIAL_CAPACITY_TOO_SMALL', '人数上限不能小于已占用名额');
      const record = await this.repository.updateTrial(
        id,
        {
          ...input,
          startsAt: input.startsAt ? startsAt : undefined,
          endsAt: input.endsAt ? endsAt : undefined,
        },
        transaction,
      );
      if (!record)
        throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-trial.updated',
          resourceType: 'admission.trial-session',
          resourceId: id,
          changes: Object.entries(input)
            .filter(([field]) => field !== 'expectedRevision')
            .map(([field, after]) => ({
              field,
              before: before[field as keyof AdmissionTrialRecord] ?? null,
              after: after ?? null,
            })),
        },
        transaction,
      );
      return this.trialView(record);
    });
  }

  async bookTrial(leadId: string, trialId: string, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const lead = await this.repository.findLead(leadId, transaction);
      if (!lead) throw new ApiError(404, 'ADMISSION_LEAD_NOT_FOUND', '线索不存在');
      let trial = await this.releaseExpiredHolds(trialId, transaction);
      this.assertReservable(trial);
      if (trial.reservationFeeAmountMinor > 0)
        throw new ApiError(
          409,
          'ADMISSION_TRIAL_PAYMENT_REQUIRED',
          '收费试听必须由家长通过小程序提交资料并支付占位费',
        );
      const existing = await this.repository.findRegistration(trialId, leadId, transaction);
      if (existing && ['booked', 'checked_in', 'no_show'].includes(existing.status))
        return {
          lead: this.leadView(lead),
          trial: this.trialView(trial),
          registration: this.registrationView(existing),
        };
      if (trial.bookedCount >= trial.capacity)
        throw new ApiError(409, 'ADMISSION_TRIAL_FULL', '试听场次已满');
      if (existing && existing.amountMinor > 0)
        throw new ApiError(
          409,
          'ADMISSION_REGISTRATION_PAYMENT_LOCKED',
          '收费预约不能改为后台免费预约',
        );
      const registration = existing
        ? await this.repository.updateRegistration(
            existing.id,
            { status: 'booked', checkedInAt: null, cancelledAt: null, notes: null },
            transaction,
          )
        : await this.repository.createRegistration(
            {
              trialSessionId: trialId,
              leadId,
              institutionId: trial.institutionId,
              trialTitleSnapshot: trial.title,
              trialStartsAtSnapshot: trial.startsAt,
              status: 'booked',
              guardianNameSnapshot: lead.guardianName,
              phoneSnapshot: lead.phone,
              studentNameSnapshot: lead.studentName,
              gradeSnapshot: lead.grade,
            },
            transaction,
          );
      if (!registration)
        throw new ApiError(409, 'ADMISSION_REGISTRATION_CONFLICT', '试听报名状态已变化');
      const updatedTrial = await this.repository.updateTrial(
        trialId,
        { expectedRevision: trial.revision, bookedCount: trial.bookedCount + 1 },
        transaction,
      );
      if (!updatedTrial)
        throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次已被其他操作更新');
      trial = updatedTrial;
      const updated = await this.repository.updateLead(
        leadId,
        { expectedRevision: lead.revision, status: 'trial_booked' },
        transaction,
      );
      if (!updated)
        throw new ApiError(409, 'ADMISSION_LEAD_VERSION_CONFLICT', '线索已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-trial.booked',
          resourceType: 'admission.trial-registration',
          resourceId: registration.id,
          changes: [{ field: 'status', before: existing?.status ?? null, after: 'booked' }],
          metadata: { trialSessionId: trialId, leadId, paymentRequired: false },
        },
        transaction,
      );
      return {
        lead: this.leadView(updated),
        trial: this.trialView(trial),
        registration: this.registrationView(registration),
      };
    });
  }

  async createReservationCheckout(
    identityUserId: string,
    trialId: string,
    input: CreateMiniAdmissionTrialReservationRequest,
    idempotencyKey: string,
    context: ActorContext,
  ): Promise<MiniAdmissionTrialReservationCheckout> {
    const provider = input.provider ?? 'mock';
    const claimed = await this.idempotency.execute(
      {
        operation: 'admissions.create-trial-reservation',
        resultSchema: miniAdmissionTrialReservationCheckoutSchema,
      },
      {
        scope: `guardian-trial-reservations:${identityUserId}`,
        key: idempotencyKey,
        request: { trialId, ...input, provider },
        actorId: identityUserId,
      },
      async (transaction) => {
        let trial = await this.releaseExpiredHolds(trialId, transaction);
        this.assertReservable(trial);
        const existing = await this.repository.findOwnedActiveRegistration(
          trialId,
          identityUserId,
          input.studentName,
          transaction,
        );
        if (existing) {
          const lead = await this.repository.findLead(existing.leadId, transaction);
          if (!lead) throw new ApiError(500, 'ADMISSION_LEAD_SNAPSHOT_MISSING', '预约线索不存在');
          return {
            lead: this.leadView(lead),
            trial: this.trialView(trial),
            registration: this.registrationView(existing),
            payment: null,
          };
        }
        if (trial.bookedCount >= trial.capacity)
          throw new ApiError(409, 'ADMISSION_TRIAL_FULL', '试听场次已满');
        const lead = await this.repository.createLead(
          {
            guardianName: input.guardianName,
            phone: input.phone,
            studentName: input.studentName,
            grade: input.grade ?? null,
            source: input.source ?? 'wechat-mini',
            sourceDetail: input.sourceDetail ?? null,
            ownerUserId: null,
          },
          transaction,
        );
        const now = this.clock();
        const paid = trial.reservationFeeAmountMinor > 0;
        const registration = await this.repository.createRegistration(
          {
            trialSessionId: trial.id,
            leadId: lead.id,
            institutionId: trial.institutionId,
            trialTitleSnapshot: trial.title,
            trialStartsAtSnapshot: trial.startsAt,
            status: paid ? 'pending_payment' : 'booked',
            guardianNameSnapshot: input.guardianName,
            phoneSnapshot: input.phone,
            studentNameSnapshot: input.studentName,
            gradeSnapshot: input.grade ?? null,
            payerIdentityUserId: identityUserId,
            orderNo: paid ? this.orderNo() : null,
            receiptNo: paid ? this.receiptNo() : null,
            amountMinor: trial.reservationFeeAmountMinor,
            provider: paid ? provider : null,
            paymentStatus: paid ? 'pending' : 'not_required',
            expiresAt: paid
              ? new Date(now.getTime() + trial.reservationHoldMinutes * 60_000)
              : null,
            refundCutoffAt: paid
              ? new Date(trial.startsAt.getTime() - trial.reservationRefundCutoffHours * 3_600_000)
              : null,
          },
          transaction,
        );
        const updatedTrial = await this.repository.updateTrial(
          trial.id,
          { expectedRevision: trial.revision, bookedCount: trial.bookedCount + 1 },
          transaction,
        );
        if (!updatedTrial)
          throw new ApiError(
            409,
            'ADMISSION_TRIAL_VERSION_CONFLICT',
            '试听场次名额发生变化，请重试',
          );
        trial = updatedTrial;
        const updatedLead = paid
          ? lead
          : ((await this.repository.updateLead(
              lead.id,
              { expectedRevision: lead.revision, status: 'trial_booked' },
              transaction,
            )) ?? lead);
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: paid
              ? 'admission-trial-reservation.payment-pending'
              : 'admission-trial-reservation.booked',
            resourceType: 'admission.trial-registration',
            resourceId: registration.id,
            changes: [
              { field: 'status', before: null, after: registration.status },
              { field: 'amountMinor', before: null, after: registration.amountMinor },
            ],
            metadata: {
              trialSessionId: trial.id,
              institutionId: trial.institutionId,
              orderNo: registration.orderNo,
              capacityOccupied: true,
            },
          },
          transaction,
        );
        return {
          lead: this.leadView(updatedLead),
          trial: this.trialView(trial),
          registration: this.registrationView(registration),
          payment: null,
        };
      },
    );

    let registration = await this.requireRegistration(claimed.value.registration.id);
    this.assertOwned(registration, identityUserId);
    if (registration.amountMinor === 0)
      return {
        lead: await this.getLead(registration.leadId),
        trial: this.trialView(await this.requireTrial(registration.trialSessionId)),
        registration: this.registrationView(registration),
        payment: null,
      };
    if (registration.status !== 'pending_payment')
      throw new ApiError(409, 'ADMISSION_RESERVATION_NOT_PAYABLE', '试听预约当前状态不能继续支付');
    if (registration.expiresAt && registration.expiresAt <= this.clock()) {
      await this.expireRegistration(registration.id, 'closed', context);
      throw new ApiError(409, 'ADMISSION_RESERVATION_EXPIRED', '试听名额保留已过期，请重新预约');
    }
    const payment = await this.ensurePaymentIntent(registration, provider, context);
    registration = await this.requireRegistration(registration.id);
    return {
      lead: await this.getLead(registration.leadId),
      trial: this.trialView(await this.requireTrial(registration.trialSessionId)),
      registration: this.registrationView(registration),
      payment,
    };
  }

  async getReservation(identityUserId: string, registrationId: string) {
    const registration = await this.requireRegistration(registrationId);
    this.assertOwned(registration, identityUserId);
    return this.registrationView(registration);
  }

  async syncReservation(identityUserId: string, registrationId: string, context: ActorContext) {
    let registration = await this.requireRegistration(registrationId);
    this.assertOwned(registration, identityUserId);
    const paymentIntentId = registration.paymentIntentId;
    if (!paymentIntentId)
      throw new ApiError(409, 'ADMISSION_RESERVATION_PAYMENT_NOT_CREATED', '预约尚未创建支付交易');
    await this.payments.reconcile(paymentIntentId, context);
    registration = await this.requireRegistration(registrationId);
    if (
      registration.status === 'pending_payment' &&
      registration.expiresAt &&
      registration.expiresAt <= this.clock()
    ) {
      await this.payments.close(paymentIntentId, context);
      registration = await this.requireRegistration(registrationId);
      if (registration.status === 'pending_payment') {
        await this.expireRegistration(registration.id, 'closed', context);
        registration = await this.requireRegistration(registrationId);
      }
    }
    return this.registrationView(registration);
  }

  async receiptForReservation(
    identityUserId: string,
    registrationId: string,
  ): Promise<AdmissionTrialReservationReceipt> {
    const registration = await this.requireRegistration(registrationId);
    this.assertOwned(registration, identityUserId);
    if (
      registration.amountMinor <= 0 ||
      registration.paymentStatus !== 'succeeded' ||
      !registration.receiptNo ||
      !registration.paidAt ||
      !['booked', 'checked_in', 'no_show'].includes(registration.status)
    )
      throw new ApiError(
        409,
        'ADMISSION_RESERVATION_RECEIPT_NOT_READY',
        '占位费支付成功后才能生成收据',
      );
    return {
      receiptNo: registration.receiptNo,
      title: '试听占位费收据',
      issuedAt: registration.paidAt.toISOString(),
      amountMinor: registration.amountMinor,
      amountUppercase: amountInChineseUppercase(registration.amountMinor),
      trial: this.trialView(await this.requireTrial(registration.trialSessionId)),
      registration: this.registrationView(registration),
    };
  }

  async checkIn(leadId: string, trialId: string, notes: string | null, context: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const lead = await this.repository.findLead(leadId, transaction);
      const trial = await this.repository.findTrial(trialId, transaction);
      const registration = await this.repository.findRegistration(trialId, leadId, transaction);
      if (!lead || !trial || !registration)
        throw new ApiError(404, 'ADMISSION_REGISTRATION_NOT_FOUND', '试听报名不存在');
      if (trial.status === 'cancelled')
        throw new ApiError(409, 'ADMISSION_TRIAL_CANCELLED', '已取消的试听场次不能签到');
      if (registration.status !== 'booked')
        throw new ApiError(409, 'ADMISSION_REGISTRATION_INVALID', '只有已确认预约才能签到');
      const updatedRegistration = await this.repository.updateRegistration(
        registration.id,
        { status: 'checked_in', checkedInAt: this.clock(), notes },
        transaction,
      );
      const updatedLead = await this.repository.updateLead(
        leadId,
        { expectedRevision: lead.revision, status: 'trial_attended' },
        transaction,
      );
      if (!updatedRegistration || !updatedLead)
        throw new ApiError(409, 'ADMISSION_CHECKIN_CONFLICT', '试听签到状态已变化');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-trial.checked-in',
          resourceType: 'admission.trial-registration',
          resourceId: registration.id,
          changes: [{ field: 'status', before: registration.status, after: 'checked_in' }],
        },
        transaction,
      );
      return {
        registration: this.registrationView(updatedRegistration),
        lead: this.leadView(updatedLead),
      };
    });
  }

  async registrations(trialId: string) {
    await this.database.transaction(async (transaction) => {
      await this.releaseExpiredHolds(trialId, transaction);
    });
    return {
      items: (await this.repository.registrationsForTrial(trialId)).map(this.registrationView),
    };
  }

  async convertLead(
    leadId: string,
    input: { institutionId: string; preferredName: string | null; school: string | null },
    context: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const lead = await this.repository.findLead(leadId, transaction);
      if (!lead) throw new ApiError(404, 'ADMISSION_LEAD_NOT_FOUND', '线索不存在');
      if (lead.convertedStudentId)
        throw new ApiError(409, 'ADMISSION_LEAD_ALREADY_CONVERTED', '线索已经转为正式学员');
      const onboarded = await this.people.onboardStudentInTransaction(
        input.institutionId,
        {
          fullName: lead.studentName,
          preferredName: input.preferredName,
          grade: lead.grade,
          school: input.school,
          gender: 'unknown',
          birthDate: null,
          notes: `招生线索 ${lead.id}`,
        },
        {
          fullName: lead.guardianName,
          phone: lead.phone,
          email: null,
          identityUserId: null,
          notes: null,
          relationship: '家长',
          isPrimary: true,
        },
        context,
        transaction,
      );
      const updated = await this.repository.updateLead(
        leadId,
        {
          expectedRevision: lead.revision,
          convertedStudentId: onboarded.student.id,
          status: 'won',
        },
        transaction,
      );
      if (!updated)
        throw new ApiError(409, 'ADMISSION_LEAD_VERSION_CONFLICT', '线索已被其他操作更新');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-lead.converted',
          resourceType: 'admission.lead',
          resourceId: leadId,
          changes: [
            { field: 'convertedStudentId', before: null, after: onboarded.student.id },
            { field: 'status', before: lead.status, after: 'won' },
          ],
        },
        transaction,
      );
      return {
        lead: this.leadView(updated),
        student: onboarded.student,
        guardian: onboarded.guardian,
      };
    });
  }

  async assertRefundAllowed(request: { merchantReference: string }) {
    if (await this.repository.findRegistrationByOrderNo(request.merchantReference))
      throw new ApiError(
        409,
        'ADMISSION_RESERVATION_REFUND_WORKFLOW_REQUIRED',
        '试听占位费必须通过专用取消退款流程处理，不能直接退款',
      );
  }

  async receive(fact: PaymentFact): Promise<void> {
    const registration = await this.repository.findRegistrationByOrderNo(fact.merchantReference);
    if (!registration) return;
    if (registration.paymentIntentId !== fact.intentId)
      throw new ApiError(409, 'ADMISSION_PAYMENT_IDENTITY_MISMATCH', '试听预约支付身份不匹配');
    if (registration.amountMinor !== fact.amountMinor || registration.currency !== fact.currency)
      throw new ApiError(409, 'ADMISSION_PAYMENT_AMOUNT_MISMATCH', '试听预约支付金额或币种不匹配');
    if (fact.status === 'failed' || fact.status === 'closed') {
      await this.expireRegistration(registration.id, fact.status, {
        actorType: 'provider',
        actorLabel: registration.provider,
        actorId: registration.payerIdentityUserId!,
      });
      return;
    }
    if (fact.status !== 'succeeded') return;
    await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockRegistrationById(registration.id, transaction);
      if (!locked) throw new ApiError(404, 'ADMISSION_REGISTRATION_NOT_FOUND', '试听预约不存在');
      if (locked.paymentStatus === 'succeeded' || locked.paymentStatus === 'refunded') return;
      const trial = await this.repository.lockTrial(locked.trialSessionId, transaction);
      if (!trial) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
      const paidInTime = !locked.expiresAt || fact.occurredAt <= locked.expiresAt;
      const occupied = locked.status === 'pending_payment';
      const canReacquire = locked.status === 'expired' && trial.bookedCount < trial.capacity;
      const confirmed = paidInTime && (occupied || canReacquire);
      const updated = await this.repository.updateRegistration(
        locked.id,
        {
          status: confirmed ? 'booked' : 'expired',
          paymentStatus: 'succeeded',
          paidAt: fact.occurredAt,
        },
        transaction,
      );
      if (!updated)
        throw new ApiError(409, 'ADMISSION_REGISTRATION_CONFLICT', '试听预约状态已变化');
      if (!confirmed && occupied) {
        const adjusted = await this.repository.updateTrial(
          trial.id,
          {
            expectedRevision: trial.revision,
            bookedCount: Math.max(0, trial.bookedCount - 1),
          },
          transaction,
        );
        if (!adjusted)
          throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次名额发生变化');
      }
      if (confirmed && canReacquire) {
        const adjusted = await this.repository.updateTrial(
          trial.id,
          { expectedRevision: trial.revision, bookedCount: trial.bookedCount + 1 },
          transaction,
        );
        if (!adjusted)
          throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次名额恢复冲突');
      }
      if (confirmed) {
        const lead = await this.repository.findLead(locked.leadId, transaction);
        if (lead && lead.status !== 'won')
          await this.repository.updateLead(
            lead.id,
            { expectedRevision: lead.revision, status: 'trial_booked' },
            transaction,
          );
      }
      await this.audit.record(
        {
          actorType: 'provider',
          actorLabel: locked.provider,
          category: 'business',
          action: confirmed
            ? 'admission-trial-reservation.paid'
            : 'admission-trial-reservation.late-payment',
          resourceType: 'admission.trial-registration',
          resourceId: locked.id,
          outcome: confirmed ? 'success' : 'failure',
          changes: [
            { field: 'paymentStatus', before: locked.paymentStatus, after: 'succeeded' },
            { field: 'status', before: locked.status, after: updated.status },
          ],
          metadata: {
            orderNo: locked.orderNo,
            paymentIntentId: fact.intentId,
            paidInTime,
            capacityReacquired: confirmed && canReacquire,
            requiresRefundReview: !confirmed,
          },
        },
        transaction,
      );
    });
  }

  private async ensurePaymentIntent(
    registration: AdmissionRegistrationRecord,
    provider: PaymentProvider,
    context: ActorContext,
  ): Promise<PaymentIntentDetail> {
    if (registration.provider !== provider)
      throw new ApiError(409, 'ADMISSION_PAYMENT_PROVIDER_CONFLICT', '预约支付方式不能变更');
    if (registration.paymentIntentId) return this.payments.getIntent(registration.paymentIntentId);
    if (!registration.orderNo)
      throw new ApiError(500, 'ADMISSION_RESERVATION_ORDER_MISSING', '收费预约缺少订单号');
    const payerOpenId =
      provider === 'wechat_pay' ? await this.payers.openIdForIdentity(context.actorId) : undefined;
    const payment = await this.payments.createIntent(
      {
        merchantReference: registration.orderNo,
        provider,
        amountMinor: registration.amountMinor,
        currency: registration.currency,
        description: `试听占位费：${registration.trialTitleSnapshot}`,
      },
      context,
      { payerOpenId },
    );
    const attached = await this.database.transaction((transaction) =>
      this.repository.attachPaymentIntent(registration.id, payment.id, transaction),
    );
    if (!attached) {
      const current = await this.requireRegistration(registration.id);
      if (current.paymentIntentId !== payment.id)
        throw new ApiError(409, 'ADMISSION_PAYMENT_CONFLICT', '试听预约支付交易发生并发冲突');
    }
    return payment;
  }

  private async expireRegistration(
    registrationId: string,
    paymentStatus: 'failed' | 'closed',
    context: ActorContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const registration = await this.repository.lockRegistrationById(registrationId, transaction);
      if (!registration || registration.status !== 'pending_payment') return;
      const trial = await this.repository.lockTrial(registration.trialSessionId, transaction);
      if (!trial) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
      await this.repository.updateRegistration(
        registration.id,
        { status: 'expired', paymentStatus },
        transaction,
      );
      const adjusted = await this.repository.updateTrial(
        trial.id,
        {
          expectedRevision: trial.revision,
          bookedCount: Math.max(0, trial.bookedCount - 1),
        },
        transaction,
      );
      if (!adjusted)
        throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次名额发生变化');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'admission-trial-reservation.expired',
          resourceType: 'admission.trial-registration',
          resourceId: registration.id,
          changes: [
            { field: 'status', before: registration.status, after: 'expired' },
            { field: 'paymentStatus', before: registration.paymentStatus, after: paymentStatus },
          ],
          metadata: { orderNo: registration.orderNo, capacityReleased: true },
        },
        transaction,
      );
    });
  }

  private async releaseExpiredHolds(trialId: string, transaction: DatabaseTransaction) {
    const trial = await this.repository.lockTrial(trialId, transaction);
    if (!trial) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
    const expired = await this.repository.expirePendingForTrial(trialId, this.clock(), transaction);
    if (expired.length === 0) return trial;
    const updated = await this.repository.updateTrial(
      trial.id,
      {
        expectedRevision: trial.revision,
        bookedCount: Math.max(0, trial.bookedCount - expired.length),
      },
      transaction,
    );
    if (!updated)
      throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次名额释放冲突');
    for (const registration of expired)
      await this.audit.record(
        {
          actorType: 'system',
          actorLabel: '试听预约过期检查',
          category: 'business',
          action: 'admission-trial-reservation.expired',
          resourceType: 'admission.trial-registration',
          resourceId: registration.id,
          changes: [{ field: 'status', before: 'pending_payment', after: 'expired' }],
          metadata: { orderNo: registration.orderNo, capacityReleased: true },
        },
        transaction,
      );
    return updated;
  }

  private assertReservable(trial: AdmissionTrialRecord) {
    if (trial.status !== 'open')
      throw new ApiError(409, 'ADMISSION_TRIAL_NOT_OPEN', '试听场次不可预约');
    if (trial.startsAt <= this.clock())
      throw new ApiError(409, 'ADMISSION_TRIAL_ALREADY_STARTED', '试听场次已经开始');
  }

  private async requireRegistration(id: string) {
    const registration = await this.repository.findRegistrationById(id);
    if (!registration)
      throw new ApiError(404, 'ADMISSION_REGISTRATION_NOT_FOUND', '试听预约不存在');
    return registration;
  }

  private async requireTrial(id: string) {
    const trial = await this.repository.findTrial(id);
    if (!trial) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
    return trial;
  }

  private assertOwned(registration: AdmissionRegistrationRecord, identityUserId: string) {
    if (registration.payerIdentityUserId !== identityUserId)
      throw new ApiError(404, 'ADMISSION_REGISTRATION_NOT_FOUND', '试听预约不存在');
  }

  private orderNo() {
    const stamp = this.clock()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    return `TR${stamp}${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private receiptNo() {
    const stamp = this.clock()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    return `TRC${stamp}${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private trialPage(
    result: { items: AdmissionTrialRecord[]; total: number },
    input: AdmissionTrialListQuery,
  ) {
    return {
      items: result.items.map(this.trialView),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  private leadView = (record: AdmissionLeadRecord): AdmissionLead => ({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    nextFollowUpAt: record.nextFollowUpAt?.toISOString() ?? null,
  });

  private followUpView = (record: AdmissionFollowUpRecord): AdmissionFollowUp => ({
    ...record,
    nextFollowUpAt: record.nextFollowUpAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  });

  private trialView = (record: AdmissionTrialRecord): AdmissionTrialSession => ({
    ...record,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });

  private registrationView = (record: AdmissionRegistrationRecord): AdmissionTrialRegistration => ({
    ...record,
    trialStartsAtSnapshot: record.trialStartsAtSnapshot.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    paidAt: record.paidAt?.toISOString() ?? null,
    refundCutoffAt: record.refundCutoffAt?.toISOString() ?? null,
    checkedInAt: record.checkedInAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function amountInChineseUppercase(amountMinor: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const sections = ['', '万', '亿'];
  const integer = Math.floor(amountMinor / 100);
  const fraction = amountMinor % 100;
  const sectionText = (initial: number) => {
    let value = initial;
    let result = '';
    let zero = false;
    for (let index = 0; index < 4; index += 1) {
      const digit = value % 10;
      if (digit === 0) zero = result.length > 0;
      else {
        result = `${zero ? '零' : ''}${digits[digit]}${units[index]}${result}`;
        zero = false;
      }
      value = Math.floor(value / 10);
    }
    return result;
  };
  let remaining = integer;
  let integerText = '';
  let sectionIndex = 0;
  let pendingZero = false;
  while (remaining > 0) {
    const section = remaining % 10_000;
    if (section === 0) pendingZero = integerText.length > 0;
    else {
      integerText = `${sectionText(section)}${sections[sectionIndex]}${pendingZero ? '零' : ''}${integerText}`;
      pendingZero = section < 1_000;
    }
    remaining = Math.floor(remaining / 10_000);
    sectionIndex += 1;
  }
  const yuan = `${integerText || '零'}元`;
  const jiao = Math.floor(fraction / 10);
  const fen = fraction % 10;
  if (jiao === 0 && fen === 0) return `${yuan}整`;
  return `${yuan}${jiao ? `${digits[jiao]}角` : fen ? '零' : ''}${fen ? `${digits[fen]}分` : ''}`;
}
