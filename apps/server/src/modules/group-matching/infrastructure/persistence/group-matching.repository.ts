import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  groupMatchingCampaigns,
  groupMatchingEnrollments,
  groupMatchingFormationMembers,
  groupMatchingFormations,
  groupMatchingPriceTiers,
} from './group-matching.schema.js';

export type GroupMatchingCampaignRecord = typeof groupMatchingCampaigns.$inferSelect;
export type GroupMatchingEnrollmentRecord = typeof groupMatchingEnrollments.$inferSelect;
export type GroupMatchingFormationRecord = typeof groupMatchingFormations.$inferSelect;
export type GroupMatchingFormationMemberRecord = typeof groupMatchingFormationMembers.$inferSelect;
export type GroupMatchingPriceTierRecord = typeof groupMatchingPriceTiers.$inferSelect;

export class GroupMatchingRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async listCampaigns(
    institutionId: string,
    input: { page: number; pageSize: number; status?: string },
  ) {
    const filters: SQL[] = [eq(groupMatchingCampaigns.institutionId, institutionId)];
    if (input.status) filters.push(eq(groupMatchingCampaigns.status, input.status as never));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(groupMatchingCampaigns)
        .where(where)
        .orderBy(desc(groupMatchingCampaigns.updatedAt), desc(groupMatchingCampaigns.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(groupMatchingCampaigns).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findCampaign(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(groupMatchingCampaigns)
      .where(eq(groupMatchingCampaigns.id, id))
      .limit(1);
    return record ?? null;
  }

  async lockCampaign(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(groupMatchingCampaigns)
      .where(eq(groupMatchingCampaigns.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async createCampaign(
    input: typeof groupMatchingCampaigns.$inferInsert,
    tiers: Array<Omit<typeof groupMatchingPriceTiers.$inferInsert, 'campaignId'>>,
    executor: DatabaseTransaction,
  ) {
    const [campaign] = await executor.insert(groupMatchingCampaigns).values(input).returning();
    const createdTiers = await executor
      .insert(groupMatchingPriceTiers)
      .values(tiers.map((tier) => ({ ...tier, campaignId: campaign!.id })))
      .returning();
    return { campaign: campaign!, tiers: createdTiers };
  }

  async updateCampaign(
    id: string,
    expectedRevision: number,
    input: Partial<typeof groupMatchingCampaigns.$inferInsert>,
    tiers: Array<Omit<typeof groupMatchingPriceTiers.$inferInsert, 'campaignId'>> | undefined,
    executor: DatabaseTransaction,
  ) {
    const [campaign] = await executor
      .update(groupMatchingCampaigns)
      .set({ ...input, revision: expectedRevision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(groupMatchingCampaigns.id, id),
          eq(groupMatchingCampaigns.revision, expectedRevision),
          eq(groupMatchingCampaigns.status, 'draft'),
        ),
      )
      .returning();
    if (!campaign) return null;
    if (tiers) {
      await executor
        .delete(groupMatchingPriceTiers)
        .where(eq(groupMatchingPriceTiers.campaignId, id));
      await executor
        .insert(groupMatchingPriceTiers)
        .values(tiers.map((tier) => ({ ...tier, campaignId: id })));
    }
    return campaign;
  }

  async transitionCampaign(
    id: string,
    fromStatuses: GroupMatchingCampaignRecord['status'][],
    toStatus: GroupMatchingCampaignRecord['status'],
    executor: DatabaseTransaction,
    extra: Partial<typeof groupMatchingCampaigns.$inferInsert> = {},
  ) {
    const [record] = await executor
      .update(groupMatchingCampaigns)
      .set({
        ...extra,
        status: toStatus,
        revision: sql`${groupMatchingCampaigns.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupMatchingCampaigns.id, id),
          inArray(groupMatchingCampaigns.status, fromStatuses),
        ),
      )
      .returning();
    return record ?? null;
  }

  listTiers(campaignId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(groupMatchingPriceTiers)
      .where(eq(groupMatchingPriceTiers.campaignId, campaignId))
      .orderBy(asc(groupMatchingPriceTiers.minParticipants));
  }

  listEnrollments(campaignId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(groupMatchingEnrollments)
      .where(eq(groupMatchingEnrollments.campaignId, campaignId))
      .orderBy(asc(groupMatchingEnrollments.createdAt), asc(groupMatchingEnrollments.id));
  }

  async countPaidEnrollments(campaignId: string, executor: DatabaseExecutor = this.database.db) {
    const [result] = await executor
      .select({ value: count() })
      .from(groupMatchingEnrollments)
      .where(
        and(
          eq(groupMatchingEnrollments.campaignId, campaignId),
          inArray(groupMatchingEnrollments.status, ['deposit_paid', 'selected']),
        ),
      );
    return result?.value ?? 0;
  }

  async createEnrollment(
    input: typeof groupMatchingEnrollments.$inferInsert,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor.insert(groupMatchingEnrollments).values(input).returning();
    return record!;
  }

  async lockEnrollment(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(groupMatchingEnrollments)
      .where(eq(groupMatchingEnrollments.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async markDepositPaid(
    id: string,
    input: {
      paymentMethod: GroupMatchingEnrollmentRecord['depositPaymentMethod'];
      paymentReference?: string | null;
      paymentNote?: string | null;
      recordedByUserId: string;
      paidAt: Date;
    },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(groupMatchingEnrollments)
      .set({
        status: 'deposit_paid',
        depositPaymentMethod: input.paymentMethod,
        depositPaymentReference: input.paymentReference,
        depositPaymentNote: input.paymentNote,
        depositRecordedByUserId: input.recordedByUserId,
        depositPaidAt: input.paidAt,
        revision: sql`${groupMatchingEnrollments.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(groupMatchingEnrollments.id, id),
          inArray(groupMatchingEnrollments.status, ['pending_deposit', 'waitlisted']),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findFormationByCampaign(campaignId: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(groupMatchingFormations)
      .where(eq(groupMatchingFormations.campaignId, campaignId))
      .limit(1);
    return record ?? null;
  }

  listFormationMembers(formationId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(groupMatchingFormationMembers)
      .where(eq(groupMatchingFormationMembers.formationId, formationId))
      .orderBy(asc(groupMatchingFormationMembers.createdAt));
  }

  async attachFormationPackage(
    formationId: string,
    lessonPackageId: string,
    lessonPackageVersion: number,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(groupMatchingFormations)
      .set({ lessonPackageId, lessonPackageVersion })
      .where(
        and(
          eq(groupMatchingFormations.id, formationId),
          sql`(${groupMatchingFormations.lessonPackageId} is null or ${groupMatchingFormations.lessonPackageId} = ${lessonPackageId})`,
          sql`(${groupMatchingFormations.lessonPackageVersion} is null or ${groupMatchingFormations.lessonPackageVersion} = ${lessonPackageVersion})`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async attachFormationMemberOrder(
    formationId: string,
    studentId: string,
    lessonOrderId: string,
    status: GroupMatchingFormationMemberRecord['status'],
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(groupMatchingFormationMembers)
      .set({ lessonOrderId, status, updatedAt: new Date() })
      .where(
        and(
          eq(groupMatchingFormationMembers.formationId, formationId),
          eq(groupMatchingFormationMembers.studentId, studentId),
          sql`(${groupMatchingFormationMembers.lessonOrderId} is null or ${groupMatchingFormationMembers.lessonOrderId} = ${lessonOrderId})`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async createFormation(
    input: typeof groupMatchingFormations.$inferInsert,
    members: Array<Omit<typeof groupMatchingFormationMembers.$inferInsert, 'formationId'>>,
    enrollmentIds: string[],
    executor: DatabaseTransaction,
  ) {
    const [formation] = await executor.insert(groupMatchingFormations).values(input).returning();
    const createdMembers = await executor
      .insert(groupMatchingFormationMembers)
      .values(members.map((member) => ({ ...member, formationId: formation!.id })))
      .returning();
    await executor
      .update(groupMatchingEnrollments)
      .set({
        status: 'selected',
        revision: sql`${groupMatchingEnrollments.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(inArray(groupMatchingEnrollments.id, enrollmentIds));
    return { formation: formation!, members: createdMembers };
  }
}
