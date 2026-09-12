import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type {
  CreatePeriodCardProductRequest,
  PeriodCardEntitlementListQuery,
  PeriodCardProductListQuery,
  PeriodCardUsageListQuery,
  UpdatePeriodCardProductRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import {
  periodCardEntitlements,
  periodCardProducts,
  periodCardProductVersions,
  periodCardUsages,
} from './period-cards.schema.js';

export type PeriodCardProductRecord = typeof periodCardProducts.$inferSelect;
export type PeriodCardProductVersionRecord = typeof periodCardProductVersions.$inferSelect;
export type PeriodCardEntitlementRecord = typeof periodCardEntitlements.$inferSelect;
export type PeriodCardUsageRecord = typeof periodCardUsages.$inferSelect;

export class PeriodCardsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async listProducts(institutionId: string, input: PeriodCardProductListQuery) {
    const filters: SQL[] = [eq(periodCardProducts.institutionId, institutionId)];
    if (input.status) filters.push(eq(periodCardProducts.status, input.status));
    if (input.mode) filters.push(eq(periodCardProducts.mode, input.mode));
    if (input.search) {
      const search = `%${input.search}%`;
      filters.push(
        or(ilike(periodCardProducts.name, search), ilike(periodCardProducts.description, search))!,
      );
    }
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(periodCardProducts)
        .where(where)
        .orderBy(asc(periodCardProducts.name), asc(periodCardProducts.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(periodCardProducts).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async listPurchasableProducts(institutionId: string, now: Date) {
    return this.database.db
      .select()
      .from(periodCardProducts)
      .where(
        and(
          eq(periodCardProducts.institutionId, institutionId),
          eq(periodCardProducts.status, 'active'),
          eq(periodCardProducts.onlineSaleEnabled, true),
          gt(periodCardProducts.priceAmount, 0),
          or(isNull(periodCardProducts.saleStartsAt), lte(periodCardProducts.saleStartsAt, now)),
          or(isNull(periodCardProducts.saleEndsAt), gt(periodCardProducts.saleEndsAt, now)),
        ),
      )
      .orderBy(asc(periodCardProducts.name), asc(periodCardProducts.id));
  }

  async findProductForInstitution(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(periodCardProducts)
      .where(
        and(
          eq(periodCardProducts.id, productId),
          eq(periodCardProducts.institutionId, institutionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findProductVersion(
    productId: string,
    version: number,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(periodCardProductVersions)
      .where(
        and(
          eq(periodCardProductVersions.productId, productId),
          eq(periodCardProductVersions.version, version),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createProduct(
    institutionId: string,
    input: CreatePeriodCardProductRequest,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(periodCardProducts)
      .values({
        institutionId,
        name: input.name,
        description: input.description ?? null,
        mode: input.mode,
        usageLimit: input.mode === 'limited' ? (input.usageLimit ?? null) : null,
        durationUnit: input.durationUnit,
        durationCount: input.durationCount,
        activationPolicy: input.activationPolicy,
        priceAmount: input.priceAmount ?? 0,
        currency: input.currency ?? 'CNY',
        onlineSaleEnabled: input.onlineSaleEnabled ?? false,
        saleStartsAt: this.toDate(input.saleStartsAt),
        saleEndsAt: this.toDate(input.saleEndsAt),
      })
      .returning();
    if (!record) throw new Error('Period card product insert returned no row');
    const version = await this.createProductVersion(record, executor);
    return { record, version };
  }

  async updateProduct(
    institutionId: string,
    productId: string,
    input: UpdatePeriodCardProductRequest,
    normalizedUsageLimit: number | null,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, saleStartsAt, saleEndsAt, ...changes } = input;
    const [record] = await executor
      .update(periodCardProducts)
      .set({
        ...changes,
        usageLimit: normalizedUsageLimit,
        ...(saleStartsAt === undefined ? {} : { saleStartsAt: this.toDate(saleStartsAt) }),
        ...(saleEndsAt === undefined ? {} : { saleEndsAt: this.toDate(saleEndsAt) }),
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(periodCardProducts.id, productId),
          eq(periodCardProducts.institutionId, institutionId),
          eq(periodCardProducts.revision, expectedRevision),
        ),
      )
      .returning();
    if (!record) return null;
    const version = await this.createProductVersion(record, executor);
    return { record, version };
  }

  async listEntitlements(institutionId: string, input: PeriodCardEntitlementListQuery, now: Date) {
    const filters: SQL[] = [eq(periodCardEntitlements.institutionId, institutionId)];
    if (input.studentId) filters.push(eq(periodCardEntitlements.studentId, input.studentId));
    if (input.productId) filters.push(eq(periodCardEntitlements.productId, input.productId));
    if (input.search) {
      const search = `%${input.search}%`;
      filters.push(
        or(
          ilike(periodCardEntitlements.studentNameSnapshot, search),
          ilike(periodCardEntitlements.productNameSnapshot, search),
          ilike(periodCardEntitlements.sourceReference, search),
        )!,
      );
    }
    if (input.status) filters.push(this.effectiveStatusFilter(input.status, now));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(periodCardEntitlements)
        .where(where)
        .orderBy(desc(periodCardEntitlements.issuedAt), desc(periodCardEntitlements.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(periodCardEntitlements).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findEntitlement(
    institutionId: string,
    entitlementId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(periodCardEntitlements)
      .where(
        and(
          eq(periodCardEntitlements.id, entitlementId),
          eq(periodCardEntitlements.institutionId, institutionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findEntitlementForUpdate(
    institutionId: string,
    entitlementId: string,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .select()
      .from(periodCardEntitlements)
      .where(
        and(
          eq(periodCardEntitlements.id, entitlementId),
          eq(periodCardEntitlements.institutionId, institutionId),
        ),
      )
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async insertEntitlement(
    input: typeof periodCardEntitlements.$inferInsert,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor.insert(periodCardEntitlements).values(input).returning();
    if (!record) throw new Error('Period card entitlement insert returned no row');
    return record;
  }

  async incrementUsage(
    entitlement: PeriodCardEntitlementRecord,
    quantity: number,
    activation: { startsAt: Date; endsAt: Date } | null,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(periodCardEntitlements)
      .set({
        usedQuantity: entitlement.usedQuantity + quantity,
        activationStartsAt: activation?.startsAt ?? entitlement.activationStartsAt,
        endsAt: activation?.endsAt ?? entitlement.endsAt,
        revision: entitlement.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(periodCardEntitlements.id, entitlement.id),
          eq(periodCardEntitlements.revision, entitlement.revision),
          eq(periodCardEntitlements.usedQuantity, entitlement.usedQuantity),
        ),
      )
      .returning();
    return record ?? null;
  }

  async decrementUsage(
    entitlement: PeriodCardEntitlementRecord,
    quantity: number,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(periodCardEntitlements)
      .set({
        usedQuantity: entitlement.usedQuantity - quantity,
        revision: entitlement.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(periodCardEntitlements.id, entitlement.id),
          eq(periodCardEntitlements.revision, entitlement.revision),
          eq(periodCardEntitlements.usedQuantity, entitlement.usedQuantity),
        ),
      )
      .returning();
    return record ?? null;
  }

  async revokeEntitlement(
    entitlement: PeriodCardEntitlementRecord,
    input: { operationId: string; reason: string; actorId: string; revokedAt: Date },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(periodCardEntitlements)
      .set({
        lifecycleState: 'revoked',
        revokedAt: input.revokedAt,
        revokedBy: input.actorId,
        revokeOperationId: input.operationId,
        revocationReason: input.reason,
        revision: entitlement.revision + 1,
        updatedAt: input.revokedAt,
      })
      .where(
        and(
          eq(periodCardEntitlements.id, entitlement.id),
          eq(periodCardEntitlements.revision, entitlement.revision),
          eq(periodCardEntitlements.lifecycleState, 'active'),
        ),
      )
      .returning();
    return record ?? null;
  }

  async listUsages(institutionId: string, input: PeriodCardUsageListQuery) {
    const filters: SQL[] = [eq(periodCardUsages.institutionId, institutionId)];
    if (input.studentId) filters.push(eq(periodCardUsages.studentId, input.studentId));
    if (input.entitlementId) filters.push(eq(periodCardUsages.entitlementId, input.entitlementId));
    if (input.status) filters.push(eq(periodCardUsages.status, input.status));
    if (input.from) filters.push(gte(periodCardUsages.occurredAt, new Date(input.from)));
    if (input.to) filters.push(lte(periodCardUsages.occurredAt, new Date(input.to)));
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(periodCardUsages)
        .where(where)
        .orderBy(desc(periodCardUsages.occurredAt), desc(periodCardUsages.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(periodCardUsages).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findUsageForUpdate(institutionId: string, usageId: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(periodCardUsages)
      .where(
        and(eq(periodCardUsages.id, usageId), eq(periodCardUsages.institutionId, institutionId)),
      )
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async insertUsage(input: typeof periodCardUsages.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor.insert(periodCardUsages).values(input).returning();
    if (!record) throw new Error('Period card usage insert returned no row');
    return record;
  }

  async reverseUsage(
    usage: PeriodCardUsageRecord,
    input: { operationId: string; reason: string; actorId: string; reversedAt: Date },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(periodCardUsages)
      .set({
        status: 'reversed',
        reversedAt: input.reversedAt,
        reversedBy: input.actorId,
        reversalOperationId: input.operationId,
        reversalReason: input.reason,
        updatedAt: input.reversedAt,
      })
      .where(and(eq(periodCardUsages.id, usage.id), eq(periodCardUsages.status, 'active')))
      .returning();
    return record ?? null;
  }

  private async createProductVersion(
    record: PeriodCardProductRecord,
    executor: DatabaseTransaction,
  ) {
    const [version] = await executor
      .insert(periodCardProductVersions)
      .values({
        productId: record.id,
        institutionId: record.institutionId,
        version: record.revision,
        name: record.name,
        description: record.description,
        mode: record.mode,
        usageLimit: record.usageLimit,
        durationUnit: record.durationUnit,
        durationCount: record.durationCount,
        activationPolicy: record.activationPolicy,
        priceAmount: record.priceAmount,
        currency: record.currency,
        onlineSaleEnabled: record.onlineSaleEnabled,
        saleStartsAt: record.saleStartsAt,
        saleEndsAt: record.saleEndsAt,
        status: record.status,
      })
      .returning();
    if (!version) throw new Error('Period card product version insert returned no row');
    return version;
  }

  private effectiveStatusFilter(
    status: PeriodCardEntitlementListQuery['status'] & string,
    now: Date,
  ): SQL {
    if (status === 'revoked') return eq(periodCardEntitlements.lifecycleState, 'revoked');
    if (status === 'pending_activation') {
      return and(
        eq(periodCardEntitlements.lifecycleState, 'active'),
        or(
          sql`${periodCardEntitlements.activationStartsAt} is null`,
          sql`${periodCardEntitlements.activationStartsAt} > ${now}`,
        ),
      )!;
    }
    if (status === 'expired') {
      return and(
        eq(periodCardEntitlements.lifecycleState, 'active'),
        sql`${periodCardEntitlements.endsAt} is not null`,
        lte(periodCardEntitlements.endsAt, now),
      )!;
    }
    const withinActiveInterval = and(
      eq(periodCardEntitlements.lifecycleState, 'active'),
      sql`${periodCardEntitlements.activationStartsAt} is not null`,
      lte(periodCardEntitlements.activationStartsAt, now),
      sql`${periodCardEntitlements.endsAt} > ${now}`,
    )!;
    const exhausted = and(
      eq(periodCardEntitlements.mode, 'limited'),
      sql`${periodCardEntitlements.usedQuantity} >= ${periodCardEntitlements.usageLimit}`,
    )!;
    return status === 'exhausted'
      ? and(withinActiveInterval, exhausted)!
      : and(withinActiveInterval, sql`not (${exhausted})`)!;
  }

  private toDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
  }
}
