import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type {
  AdmissionLeadListQuery,
  AdmissionTrialListQuery,
  CreateAdmissionLeadRequest,
  CreateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  admissionFollowUps,
  admissionLeads,
  admissionTrialRegistrations,
  admissionTrialSessions,
} from './admissions.schema.js';

export type AdmissionLeadRecord = typeof admissionLeads.$inferSelect;
export type AdmissionFollowUpRecord = typeof admissionFollowUps.$inferSelect;
export type AdmissionTrialRecord = typeof admissionTrialSessions.$inferSelect;
export type AdmissionRegistrationRecord = typeof admissionTrialRegistrations.$inferSelect;
type LeadUpdate = { expectedRevision: number } & Partial<
  Pick<AdmissionLeadRecord, 'status' | 'ownerUserId' | 'nextFollowUpAt' | 'convertedStudentId'>
>;
type TrialUpdate = { expectedRevision: number } & Partial<
  Pick<
    AdmissionTrialRecord,
    | 'institutionId'
    | 'campusId'
    | 'courseId'
    | 'teacherId'
    | 'title'
    | 'startsAt'
    | 'endsAt'
    | 'capacity'
    | 'bookedCount'
    | 'status'
    | 'notes'
  >
>;

export class AdmissionsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async listLeads(input: AdmissionLeadListQuery) {
    const filters: SQL[] = [];
    if (input.search)
      filters.push(
        or(
          ilike(admissionLeads.studentName, `%${input.search}%`),
          ilike(admissionLeads.guardianName, `%${input.search}%`),
          ilike(admissionLeads.phone, `%${input.search}%`),
        )!,
      );
    if (input.status) filters.push(eq(admissionLeads.status, input.status));
    const where = filters.length ? and(...filters) : undefined;
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(admissionLeads)
        .where(where)
        .orderBy(desc(admissionLeads.updatedAt), asc(admissionLeads.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(admissionLeads).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findLead(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor.select().from(admissionLeads).where(eq(admissionLeads.id, id));
    return record ?? null;
  }

  async createLead(input: CreateAdmissionLeadRequest, executor: DatabaseTransaction) {
    const [record] = await executor.insert(admissionLeads).values(input).returning();
    return record!;
  }

  async updateLead(id: string, input: LeadUpdate, executor: DatabaseTransaction) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(admissionLeads)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(and(eq(admissionLeads.id, id), eq(admissionLeads.revision, expectedRevision)))
      .returning();
    return record ?? null;
  }

  async listFollowUps(leadId: string) {
    return this.database.db
      .select()
      .from(admissionFollowUps)
      .where(eq(admissionFollowUps.leadId, leadId))
      .orderBy(desc(admissionFollowUps.createdAt));
  }

  async createFollowUp(
    input: { leadId: string; content: string; nextFollowUpAt: Date | null; createdBy: string },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor.insert(admissionFollowUps).values(input).returning();
    return record!;
  }

  async listTrials(input: AdmissionTrialListQuery) {
    const filters: SQL[] = [];
    if (input.institutionId)
      filters.push(eq(admissionTrialSessions.institutionId, input.institutionId));
    if (input.status) filters.push(eq(admissionTrialSessions.status, input.status));
    const where = filters.length ? and(...filters) : undefined;
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(admissionTrialSessions)
        .where(where)
        .orderBy(asc(admissionTrialSessions.startsAt), asc(admissionTrialSessions.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(admissionTrialSessions).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findTrial(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(admissionTrialSessions)
      .where(eq(admissionTrialSessions.id, id));
    return record ?? null;
  }

  async createTrial(input: CreateAdmissionTrialRequest, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(admissionTrialSessions)
      .values({ ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) })
      .returning();
    return record!;
  }

  async updateTrial(id: string, input: TrialUpdate, executor: DatabaseTransaction) {
    const { expectedRevision, ...changes } = input;
    const [record] = await executor
      .update(admissionTrialSessions)
      .set({ ...changes, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(admissionTrialSessions.id, id),
          eq(admissionTrialSessions.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findRegistration(
    trialSessionId: string,
    leadId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(admissionTrialRegistrations)
      .where(
        and(
          eq(admissionTrialRegistrations.trialSessionId, trialSessionId),
          eq(admissionTrialRegistrations.leadId, leadId),
        ),
      );
    return record ?? null;
  }

  async createRegistration(trialSessionId: string, leadId: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(admissionTrialRegistrations)
      .values({ trialSessionId, leadId })
      .returning();
    return record!;
  }

  async updateRegistration(
    id: string,
    changes: Partial<Pick<AdmissionRegistrationRecord, 'status' | 'checkedInAt' | 'notes'>>,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(admissionTrialRegistrations)
      .set(changes)
      .where(eq(admissionTrialRegistrations.id, id))
      .returning();
    return record ?? null;
  }

  async registrationsForTrial(trialSessionId: string) {
    return this.database.db
      .select()
      .from(admissionTrialRegistrations)
      .where(eq(admissionTrialRegistrations.trialSessionId, trialSessionId))
      .orderBy(asc(admissionTrialRegistrations.createdAt));
  }
}
