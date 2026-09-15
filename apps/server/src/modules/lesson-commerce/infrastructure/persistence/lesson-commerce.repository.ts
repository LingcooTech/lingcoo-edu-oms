import type { LessonOrderListQuery, LessonOrderStatus } from '@lingcoo-edu-oms/contracts';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { lessonCommerceOrders, lessonCommerceRefundRequests } from './lesson-commerce.schema.js';

export type LessonCommerceOrderRecord = typeof lessonCommerceOrders.$inferSelect;
export type LessonCommerceRefundRecord = typeof lessonCommerceRefundRequests.$inferSelect;

export class LessonCommerceRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async create(
    input: typeof lessonCommerceOrders.$inferInsert,
    executor: DatabaseTransaction,
  ): Promise<LessonCommerceOrderRecord> {
    const [record] = await executor.insert(lessonCommerceOrders).values(input).returning();
    return record!;
  }

  async findById(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(lessonCommerceOrders)
      .where(eq(lessonCommerceOrders.id, id))
      .limit(1);
    return record ?? null;
  }

  async findByOrderNo(orderNo: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(lessonCommerceOrders)
      .where(eq(lessonCommerceOrders.orderNo, orderNo))
      .limit(1);
    return record ?? null;
  }

  async findByPaymentIntentId(intentId: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(lessonCommerceOrders)
      .where(eq(lessonCommerceOrders.paymentIntentId, intentId))
      .limit(1);
    return record ?? null;
  }

  async findGroupFormationStudent(
    formationId: string,
    studentId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(lessonCommerceOrders)
      .where(
        and(
          eq(lessonCommerceOrders.sourceType, 'group_formation'),
          eq(lessonCommerceOrders.sourceReferenceId, formationId),
          eq(lessonCommerceOrders.studentId, studentId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  listGroupFormationOrders(formationId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(lessonCommerceOrders)
      .where(
        and(
          eq(lessonCommerceOrders.sourceType, 'group_formation'),
          eq(lessonCommerceOrders.sourceReferenceId, formationId),
        ),
      )
      .orderBy(lessonCommerceOrders.createdAt, lessonCommerceOrders.id);
  }

  async lockById(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(lessonCommerceOrders)
      .where(eq(lessonCommerceOrders.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async attachPaymentIntent(id: string, paymentIntentId: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        paymentIntentId,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.status, 'pending_payment'),
          sql`${lessonCommerceOrders.paymentIntentId} is null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async prepareOnlineSettlement(
    id: string,
    expectedRevision: number,
    provider: 'mock' | 'wechat_pay',
    expiresAt: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'pending_payment',
        channel: 'online',
        provider,
        paymentMethod: provider === 'wechat_pay' ? 'wechat_pay' : 'mock',
        expiresAt,
        closedAt: null,
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.status, 'awaiting_settlement'),
          eq(lessonCommerceOrders.sourceType, 'group_formation'),
          eq(lessonCommerceOrders.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async recordOfflineSettlement(
    id: string,
    expectedRevision: number,
    input: {
      paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
      paymentReference?: string | null;
      paymentNote?: string | null;
      paidAt: Date;
    },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'paid_pending_grant',
        channel: 'offline',
        provider: null,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        paymentNote: input.paymentNote ?? null,
        paidAt: input.paidAt,
        expiresAt: null,
        failureCode: null,
        failureMessage: null,
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.status, 'awaiting_settlement'),
          eq(lessonCommerceOrders.sourceType, 'group_formation'),
          eq(lessonCommerceOrders.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async restoreAwaitingSettlement(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'awaiting_settlement',
        channel: 'pending',
        provider: null,
        paymentMethod: 'pending',
        paymentIntentId: null,
        expiresAt: null,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.status, 'pending_payment'),
          eq(lessonCommerceOrders.sourceType, 'group_formation'),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markPaid(id: string, paidAt: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'paid_pending_grant',
        paidAt,
        failureCode: null,
        failureMessage: null,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          sql`${lessonCommerceOrders.status} in ('pending_payment','grant_failed')`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markLessonCompleted(id: string, grantMovementId: string, executor: DatabaseTransaction) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'completed',
        grantMovementId,
        completedAt: now,
        failureCode: null,
        failureMessage: null,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.productType, 'lesson_package'),
          sql`${lessonCommerceOrders.status} in ('paid_pending_grant','grant_failed')`,
          sql`${lessonCommerceOrders.grantMovementId} is null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markPeriodCardCompleted(
    id: string,
    periodCardEntitlementId: string,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'completed',
        periodCardEntitlementId,
        completedAt: now,
        failureCode: null,
        failureMessage: null,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.productType, 'period_card'),
          sql`${lessonCommerceOrders.status} in ('paid_pending_grant','grant_failed')`,
          sql`${lessonCommerceOrders.periodCardEntitlementId} is null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markGrantFailed(
    id: string,
    failureCode: string,
    failureMessage: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'grant_failed',
        failureCode: failureCode.slice(0, 120),
        failureMessage: failureMessage.slice(0, 500),
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          sql`${lessonCommerceOrders.status} in ('paid_pending_grant','grant_failed')`,
          sql`${lessonCommerceOrders.grantMovementId} is null and ${lessonCommerceOrders.periodCardEntitlementId} is null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markClosed(id: string, executor: DatabaseTransaction) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'closed',
        closedAt: now,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(eq(lessonCommerceOrders.id, id), eq(lessonCommerceOrders.status, 'pending_payment')),
      )
      .returning();
    return record ?? null;
  }

  async markRefunding(id: string, expectedRevision: number, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'refunding',
        completedAt: null,
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceOrders.id, id),
          eq(lessonCommerceOrders.status, 'completed'),
          eq(lessonCommerceOrders.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markRefunded(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'refunded',
        completedAt: null,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(lessonCommerceOrders.id, id), eq(lessonCommerceOrders.status, 'refunding')))
      .returning();
    return record ?? null;
  }

  async restoreCompletedAfterRejectedRefund(
    id: string,
    completedAt: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonCommerceOrders)
      .set({
        status: 'completed',
        completedAt,
        revision: sql`${lessonCommerceOrders.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(lessonCommerceOrders.id, id), eq(lessonCommerceOrders.status, 'refunding')))
      .returning();
    return record ?? null;
  }

  async createRefundRequest(
    input: typeof lessonCommerceRefundRequests.$inferInsert,
    executor: DatabaseTransaction,
  ): Promise<LessonCommerceRefundRecord> {
    const [record] = await executor.insert(lessonCommerceRefundRequests).values(input).returning();
    return record!;
  }

  async findRefundRequestById(
    id: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<LessonCommerceRefundRecord | null> {
    const [record] = await executor
      .select()
      .from(lessonCommerceRefundRequests)
      .where(eq(lessonCommerceRefundRequests.id, id))
      .limit(1);
    return record ?? null;
  }

  async findRefundRequestByKey(
    orderId: string,
    requestKey: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<LessonCommerceRefundRecord | null> {
    const [record] = await executor
      .select()
      .from(lessonCommerceRefundRequests)
      .where(
        and(
          eq(lessonCommerceRefundRequests.orderId, orderId),
          eq(lessonCommerceRefundRequests.requestKey, requestKey),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findActiveRefundRequestForOrder(
    orderId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<LessonCommerceRefundRecord | null> {
    const [record] = await executor
      .select()
      .from(lessonCommerceRefundRequests)
      .where(
        and(
          eq(lessonCommerceRefundRequests.orderId, orderId),
          sql`${lessonCommerceRefundRequests.status} in ('requested','approved','processing','awaiting_offline_refund','failed')`,
        ),
      )
      .orderBy(desc(lessonCommerceRefundRequests.createdAt))
      .limit(1);
    return record ?? null;
  }

  listRefundRequestsForOrder(
    orderId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<LessonCommerceRefundRecord[]> {
    return executor
      .select()
      .from(lessonCommerceRefundRequests)
      .where(eq(lessonCommerceRefundRequests.orderId, orderId))
      .orderBy(desc(lessonCommerceRefundRequests.createdAt), desc(lessonCommerceRefundRequests.id));
  }

  async lockRefundRequest(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(lessonCommerceRefundRequests)
      .where(eq(lessonCommerceRefundRequests.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async approveRefundRequest(
    id: string,
    expectedRevision: number,
    reviewerId: string,
    reviewNote: string | null,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'approved',
        reviewedByUserId: reviewerId,
        reviewNote,
        approvedAt: now,
        failureStage: null,
        failureCode: null,
        failureMessage: null,
        revision: expectedRevision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          eq(lessonCommerceRefundRequests.status, 'requested'),
          eq(lessonCommerceRefundRequests.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async rejectRefundRequest(
    id: string,
    expectedRevision: number,
    reviewerId: string,
    reviewNote: string,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'rejected',
        reviewedByUserId: reviewerId,
        reviewNote,
        rejectedAt: now,
        revision: expectedRevision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          eq(lessonCommerceRefundRequests.status, 'requested'),
          eq(lessonCommerceRefundRequests.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async cancelRefundRequest(
    id: string,
    expectedRevision: number,
    note: string,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'cancelled',
        reviewNote: note,
        cancelledAt: now,
        failureStage: null,
        failureCode: null,
        failureMessage: null,
        revision: expectedRevision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          sql`${lessonCommerceRefundRequests.status} in ('requested','failed')`,
          eq(lessonCommerceRefundRequests.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markRefundProcessing(id: string, expectedRevision: number, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'processing',
        failureStage: null,
        failureCode: null,
        failureMessage: null,
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          sql`${lessonCommerceRefundRequests.status} in ('approved','failed')`,
          eq(lessonCommerceRefundRequests.revision, expectedRevision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markEntitlementRecovered(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        entitlementRecoveredAt: new Date(),
        revision: sql`${lessonCommerceRefundRequests.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          eq(lessonCommerceRefundRequests.status, 'processing'),
          sql`${lessonCommerceRefundRequests.entitlementRecoveredAt} is null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markAwaitingOfflineRefund(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'awaiting_offline_refund',
        revision: sql`${lessonCommerceRefundRequests.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          eq(lessonCommerceRefundRequests.status, 'processing'),
          sql`${lessonCommerceRefundRequests.entitlementRecoveredAt} is not null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markFundsRefunded(
    id: string,
    input: {
      paymentRefundId?: string | null;
      offlineRefundMethod?: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other' | null;
      offlineRefundReference?: string | null;
      offlineRefundNote?: string | null;
      refundedAt: Date;
    },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        paymentRefundId: input.paymentRefundId ?? null,
        offlineRefundMethod: input.offlineRefundMethod ?? null,
        offlineRefundReference: input.offlineRefundReference ?? null,
        offlineRefundNote: input.offlineRefundNote ?? null,
        fundsRefundedAt: input.refundedAt,
        revision: sql`${lessonCommerceRefundRequests.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          sql`${lessonCommerceRefundRequests.status} in ('processing','awaiting_offline_refund')`,
          sql`${lessonCommerceRefundRequests.fundsRefundedAt} is null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markRefundRequestCompleted(id: string, executor: DatabaseTransaction) {
    const now = new Date();
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'completed',
        completedAt: now,
        failureStage: null,
        failureCode: null,
        failureMessage: null,
        revision: sql`${lessonCommerceRefundRequests.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          sql`${lessonCommerceRefundRequests.status} in ('processing','awaiting_offline_refund')`,
          sql`${lessonCommerceRefundRequests.entitlementRecoveredAt} is not null`,
          sql`${lessonCommerceRefundRequests.fundsRefundedAt} is not null`,
        ),
      )
      .returning();
    return record ?? null;
  }

  async markRefundRequestFailed(
    id: string,
    stage: 'entitlement_recovery' | 'funds_refund' | 'finalization',
    code: string,
    message: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(lessonCommerceRefundRequests)
      .set({
        status: 'failed',
        failureStage: stage,
        failureCode: code.slice(0, 120),
        failureMessage: message.slice(0, 500),
        revision: sql`${lessonCommerceRefundRequests.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonCommerceRefundRequests.id, id),
          sql`${lessonCommerceRefundRequests.status} in ('approved','processing')`,
        ),
      )
      .returning();
    return record ?? null;
  }

  isRefundRequestConflict(error: unknown): boolean {
    let current = error;
    for (let depth = 0; depth < 3; depth += 1) {
      if (!current || typeof current !== 'object') return false;
      const candidate = current as { code?: string; constraint?: string; cause?: unknown };
      if (
        candidate.code === '23505' &&
        [
          'lesson_commerce_refunds_order_request_key_unique',
          'lesson_commerce_refunds_order_active_unique',
        ].includes(candidate.constraint ?? '')
      ) {
        return true;
      }
      current = candidate.cause;
    }
    return false;
  }

  listForGuardian(guardianId: string, input: LessonOrderListQuery) {
    return this.list([eq(lessonCommerceOrders.guardianId, guardianId)], input);
  }

  listForInstitution(institutionId: string, input: LessonOrderListQuery) {
    return this.list([eq(lessonCommerceOrders.institutionId, institutionId)], input);
  }

  private async list(filters: SQL[], input: LessonOrderListQuery) {
    if (input.status) filters.push(eq(lessonCommerceOrders.status, input.status));
    if (input.productType) filters.push(eq(lessonCommerceOrders.productType, input.productType));
    if (input.studentId) filters.push(eq(lessonCommerceOrders.studentId, input.studentId));
    if (input.search) {
      const search = `%${input.search}%`;
      filters.push(
        or(
          ilike(lessonCommerceOrders.orderNo, search),
          ilike(lessonCommerceOrders.packageName, search),
          ilike(lessonCommerceOrders.periodCardProductName, search),
          ilike(lessonCommerceOrders.studentName, search),
          ilike(lessonCommerceOrders.guardianName, search),
        )!,
      );
    }
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(lessonCommerceOrders)
        .where(where)
        .orderBy(desc(lessonCommerceOrders.createdAt), desc(lessonCommerceOrders.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(lessonCommerceOrders).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  isOrderNoViolation(error: unknown): boolean {
    let current = error;
    for (let depth = 0; depth < 3; depth += 1) {
      if (!current || typeof current !== 'object') return false;
      const candidate = current as { code?: string; constraint?: string; cause?: unknown };
      if (
        candidate.code === '23505' &&
        candidate.constraint === 'lesson_commerce_orders_order_no_unique'
      ) {
        return true;
      }
      current = candidate.cause;
    }
    return false;
  }
}

export function isPaidOrderStatus(status: LessonOrderStatus): boolean {
  return ['paid_pending_grant', 'completed', 'grant_failed', 'refunding', 'refunded'].includes(
    status,
  );
}
