import type {
  PaymentCallbackQuery,
  PaymentIntentQuery,
  PaymentRefundQuery,
  PaymentTransactionQuery,
} from '@lingcoo-edu-oms/contracts';
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  paymentCallbacks,
  paymentIntents,
  paymentProviderTransactions,
  paymentRefunds,
} from './payments.schema.js';

export class PaymentsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async insertIntent(input: typeof paymentIntents.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(paymentIntents)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findIntent(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, id))
      .limit(1);
    return record ?? null;
  }

  async findIntentByReference(reference: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.merchantReference, reference))
      .limit(1);
    return record ?? null;
  }

  async lockIntent(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(paymentIntents)
      .where(eq(paymentIntents.id, id))
      .limit(1)
      .for('update');
    return record ?? null;
  }

  async setIntentStatus(
    id: string,
    status: string,
    input: { refundedAmountMinor?: number; paidAt?: Date | null; closedAt?: Date | null } = {},
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(paymentIntents)
      .set({
        status,
        ...input,
        revision: sql`${paymentIntents.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, id))
      .returning();
    return record ?? null;
  }

  async insertTransaction(
    input: typeof paymentProviderTransactions.$inferInsert,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(paymentProviderTransactions)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findTransactionByProviderId(
    provider: string,
    id: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(paymentProviderTransactions)
      .where(
        and(
          eq(paymentProviderTransactions.provider, provider),
          eq(paymentProviderTransactions.providerTransactionId, id),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async latestTransaction(intentId: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(paymentProviderTransactions)
      .where(eq(paymentProviderTransactions.intentId, intentId))
      .orderBy(desc(paymentProviderTransactions.createdAt))
      .limit(1);
    return record ?? null;
  }

  transactionsForIntent(intentId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(paymentProviderTransactions)
      .where(eq(paymentProviderTransactions.intentId, intentId))
      .orderBy(desc(paymentProviderTransactions.createdAt));
  }

  async setTransactionStatus(
    id: string,
    status: string,
    queried: boolean,
    executor: DatabaseTransaction,
    providerMetadata?: Record<string, unknown>,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(paymentProviderTransactions)
      .set({
        status,
        updatedAt: now,
        lastQueriedAt: queried ? now : undefined,
        ...(providerMetadata === undefined ? {} : { providerMetadata }),
      })
      .where(eq(paymentProviderTransactions.id, id))
      .returning();
    return record ?? null;
  }

  async insertCallback(input: typeof paymentCallbacks.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(paymentCallbacks)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findCallback(
    provider: string,
    eventId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(paymentCallbacks)
      .where(
        and(eq(paymentCallbacks.provider, provider), eq(paymentCallbacks.providerEventId, eventId)),
      )
      .limit(1);
    return record ?? null;
  }

  async insertRefund(input: typeof paymentRefunds.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(paymentRefunds)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findRefundByRequest(
    intentId: string,
    requestKey: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(paymentRefunds)
      .where(and(eq(paymentRefunds.intentId, intentId), eq(paymentRefunds.requestKey, requestKey)))
      .limit(1);
    return record ?? null;
  }

  async setRefundResult(
    id: string,
    providerRefundId: string | null,
    status: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(paymentRefunds)
      .set({ providerRefundId, status, updatedAt: new Date() })
      .where(eq(paymentRefunds.id, id))
      .returning();
    return record ?? null;
  }

  refundsForIntent(intentId: string, executor: DatabaseExecutor = this.database.db) {
    return executor
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.intentId, intentId))
      .orderBy(desc(paymentRefunds.createdAt));
  }

  async reservedRefundAmount(intentId: string, executor: DatabaseExecutor) {
    const [result] = await executor
      .select({ value: sql<number>`coalesce(sum(${paymentRefunds.amountMinor}), 0)::bigint` })
      .from(paymentRefunds)
      .where(
        and(
          eq(paymentRefunds.intentId, intentId),
          inArray(paymentRefunds.status, ['pending', 'succeeded', 'unknown']),
        ),
      );
    return Number(result?.value ?? 0);
  }

  listIntents(query: PaymentIntentQuery) {
    const filters: SQL[] = [];
    if (query.provider) filters.push(eq(paymentIntents.provider, query.provider));
    if (query.status) filters.push(eq(paymentIntents.status, query.status));
    if (query.search) {
      const value = `%${query.search}%`;
      const filter = or(
        ilike(paymentIntents.merchantReference, value),
        ilike(paymentIntents.description, value),
      );
      if (filter) filters.push(filter);
    }
    const where = filters.length ? and(...filters) : undefined;
    return Promise.all([
      this.database.db
        .select()
        .from(paymentIntents)
        .where(where)
        .orderBy(desc(paymentIntents.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(paymentIntents).where(where),
    ]).then(([items, [total]]) => ({ items, total: total?.value ?? 0 }));
  }

  listTransactions(query: PaymentTransactionQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(paymentProviderTransactions.status, query.status));
    if (query.search)
      filters.push(ilike(paymentProviderTransactions.providerTransactionId, `%${query.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    return Promise.all([
      this.database.db
        .select()
        .from(paymentProviderTransactions)
        .where(where)
        .orderBy(desc(paymentProviderTransactions.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(paymentProviderTransactions).where(where),
    ]).then(([items, [total]]) => ({ items, total: total?.value ?? 0 }));
  }

  listRefunds(query: PaymentRefundQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(paymentRefunds.status, query.status));
    if (query.search) {
      const value = `%${query.search}%`;
      const filter = or(
        ilike(paymentRefunds.requestKey, value),
        ilike(paymentRefunds.providerRefundId, value),
      );
      if (filter) filters.push(filter);
    }
    const where = filters.length ? and(...filters) : undefined;
    return Promise.all([
      this.database.db
        .select()
        .from(paymentRefunds)
        .where(where)
        .orderBy(desc(paymentRefunds.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(paymentRefunds).where(where),
    ]).then(([items, [total]]) => ({ items, total: total?.value ?? 0 }));
  }

  listCallbacks(query: PaymentCallbackQuery) {
    const filters: SQL[] = [];
    if (query.eventType) filters.push(eq(paymentCallbacks.eventType, query.eventType));
    if (query.search) {
      const value = `%${query.search}%`;
      const filter = or(
        ilike(paymentCallbacks.providerEventId, value),
        ilike(paymentCallbacks.providerTransactionId, value),
      );
      if (filter) filters.push(filter);
    }
    const where = filters.length ? and(...filters) : undefined;
    return Promise.all([
      this.database.db
        .select()
        .from(paymentCallbacks)
        .where(where)
        .orderBy(desc(paymentCallbacks.receivedAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(paymentCallbacks).where(where),
    ]).then(([items, [total]]) => ({ items, total: total?.value ?? 0 }));
  }
}
