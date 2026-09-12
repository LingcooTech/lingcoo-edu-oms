import type { LessonOrderListQuery, LessonOrderStatus } from '@lingcoo-edu-oms/contracts';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { lessonCommerceOrders } from './lesson-commerce.schema.js';

export type LessonCommerceOrderRecord = typeof lessonCommerceOrders.$inferSelect;

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
