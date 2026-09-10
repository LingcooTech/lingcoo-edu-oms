import { ApiError } from '@lingcoo-tech/http';
import type {
  AdmissionFollowUp,
  AdmissionLead,
  AdmissionLeadListQuery,
  AdmissionTrialListQuery,
  AdmissionTrialSession,
  CreateAdmissionFollowUpRequest,
  CreateAdmissionLeadRequest,
  CreateAdmissionTrialRequest,
  UpdateAdmissionLeadRequest,
  UpdateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { StudentOnboardingDirectory } from '../../people/public.js';
import {
  AdmissionsRepository,
  type AdmissionFollowUpRecord,
  type AdmissionLeadRecord,
  type AdmissionTrialRecord,
} from '../infrastructure/persistence/admissions.repository.js';

export class AdmissionsService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: AdmissionsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly people: StudentOnboardingDirectory,
    private readonly audit: AuditWriter,
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
  async createLead(
    input: CreateAdmissionLeadRequest,
    context: AuditContext,
  ): Promise<AdmissionLead> {
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
  async updateLead(
    id: string,
    input: UpdateAdmissionLeadRequest,
    context: AuditContext,
  ): Promise<AdmissionLead> {
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
  async addFollowUp(
    id: string,
    input: CreateAdmissionFollowUpRequest,
    context: AuditContext,
  ): Promise<{ followUp: AdmissionFollowUp; lead: AdmissionLead }> {
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
    const result = await this.repository.listTrials(input);
    return {
      items: result.items.map(this.trialView),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }
  async createTrial(
    input: CreateAdmissionTrialRequest,
    context: AuditContext,
  ): Promise<AdmissionTrialSession> {
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
          ],
        },
        transaction,
      );
      return this.trialView(record);
    });
  }
  async updateTrial(
    id: string,
    input: UpdateAdmissionTrialRequest,
    context: AuditContext,
  ): Promise<AdmissionTrialSession> {
    return this.database.transaction(async (transaction) => {
      const before = await this.repository.findTrial(id, transaction);
      if (!before) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
      if (input.institutionId)
        await this.institutions.assertActiveInstitution(input.institutionId, transaction);
      const startsAt = input.startsAt ? new Date(input.startsAt) : before.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : before.endsAt;
      if (endsAt <= startsAt)
        throw new ApiError(422, 'ADMISSION_TRIAL_TIME_INVALID', '试听结束时间必须晚于开始时间');
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
      const trial = await this.repository.findTrial(trialId, transaction);
      if (!trial) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
      if (trial.status !== 'open')
        throw new ApiError(409, 'ADMISSION_TRIAL_NOT_OPEN', '试听场次不可预约');
      const existing = await this.repository.findRegistration(trialId, leadId, transaction);
      if (existing && existing.status !== 'cancelled')
        return { lead: this.leadView(lead), trial: this.trialView(trial), registration: existing };
      if (trial.bookedCount >= trial.capacity)
        throw new ApiError(409, 'ADMISSION_TRIAL_FULL', '试听场次已满');
      const registration = existing
        ? await this.repository.updateRegistration(
            existing.id,
            { status: 'booked', checkedInAt: null, notes: null },
            transaction,
          )
        : await this.repository.createRegistration(trialId, leadId, transaction);
      if (!registration)
        throw new ApiError(409, 'ADMISSION_REGISTRATION_CONFLICT', '试听报名状态已变化');
      const updatedTrial = await this.repository.updateTrial(
        trialId,
        { expectedRevision: trial.revision, bookedCount: trial.bookedCount + 1 },
        transaction,
      );
      if (!updatedTrial)
        throw new ApiError(409, 'ADMISSION_TRIAL_VERSION_CONFLICT', '试听场次已被其他操作更新');
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
          changes: [
            { field: 'leadId', before: existing?.leadId ?? null, after: leadId },
            { field: 'trialSessionId', before: existing?.trialSessionId ?? null, after: trialId },
          ],
        },
        transaction,
      );
      return { lead: this.leadView(updated), trial: this.trialView(updatedTrial), registration };
    });
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
        throw new ApiError(409, 'ADMISSION_REGISTRATION_INVALID', '当前报名状态不能签到');
      const updatedRegistration = await this.repository.updateRegistration(
        registration.id,
        { status: 'checked_in', checkedInAt: new Date(), notes },
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
      return { registration: updatedRegistration, lead: this.leadView(updatedLead) };
    });
  }
  async registrations(trialId: string) {
    const trial = await this.repository.findTrial(trialId);
    if (!trial) throw new ApiError(404, 'ADMISSION_TRIAL_NOT_FOUND', '试听场次不存在');
    return { items: await this.repository.registrationsForTrial(trialId) };
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
}
