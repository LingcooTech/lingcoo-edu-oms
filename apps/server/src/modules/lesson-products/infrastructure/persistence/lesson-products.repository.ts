import { and, asc, count, eq, gt, ilike, isNull, lte, or, type SQL } from 'drizzle-orm';
import type {
  CreateLessonPackageRequest,
  LessonPackageListQuery,
  UpdateLessonPackageRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { lessonPackageTemplates, lessonPackageVersions } from './lesson-products.schema.js';

export type LessonPackageRecord = typeof lessonPackageTemplates.$inferSelect;
export type LessonPackageVersionRecord = typeof lessonPackageVersions.$inferSelect;

export interface CreateInternalLessonPackageInput {
  institutionId: string;
  originType: 'group_formation';
  originId: string;
  name: string;
  description: string | null;
  baseUnits: number;
  bonusUnits: number;
  priceAmount: number;
}

export class LessonProductsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async list(institutionId: string, input: LessonPackageListQuery) {
    const filters: SQL[] = [eq(lessonPackageTemplates.institutionId, institutionId)];
    if (input.status) filters.push(eq(lessonPackageTemplates.status, input.status));
    if (input.search) {
      const search = `%${input.search}%`;
      filters.push(
        or(
          ilike(lessonPackageTemplates.name, search),
          ilike(lessonPackageTemplates.description, search),
        )!,
      );
    }
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(lessonPackageTemplates)
        .where(where)
        .orderBy(asc(lessonPackageTemplates.name), asc(lessonPackageTemplates.id))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(lessonPackageTemplates).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async listPurchasable(institutionId: string, now: Date) {
    return this.database.db
      .select()
      .from(lessonPackageTemplates)
      .where(
        and(
          eq(lessonPackageTemplates.institutionId, institutionId),
          eq(lessonPackageTemplates.saleScope, 'public'),
          eq(lessonPackageTemplates.status, 'active'),
          eq(lessonPackageTemplates.onlineSaleEnabled, true),
          gt(lessonPackageTemplates.priceAmount, 0),
          or(
            isNull(lessonPackageTemplates.saleStartsAt),
            lte(lessonPackageTemplates.saleStartsAt, now),
          ),
          or(isNull(lessonPackageTemplates.saleEndsAt), gt(lessonPackageTemplates.saleEndsAt, now)),
        ),
      )
      .orderBy(asc(lessonPackageTemplates.name), asc(lessonPackageTemplates.id));
  }

  async find(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(lessonPackageTemplates)
      .where(eq(lessonPackageTemplates.id, id))
      .limit(1);
    return record ?? null;
  }

  async findForInstitution(
    institutionId: string,
    id: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(lessonPackageTemplates)
      .where(
        and(
          eq(lessonPackageTemplates.id, id),
          eq(lessonPackageTemplates.institutionId, institutionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findVersion(
    packageId: string,
    version: number,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(lessonPackageVersions)
      .where(
        and(
          eq(lessonPackageVersions.packageId, packageId),
          eq(lessonPackageVersions.version, version),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async create(
    input: CreateLessonPackageRequest & { institutionId: string },
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(lessonPackageTemplates)
      .values({
        ...input,
        saleScope: 'public',
        originType: null,
        originId: null,
        saleStartsAt: this.toDate(input.saleStartsAt),
        saleEndsAt: this.toDate(input.saleEndsAt),
      })
      .returning();
    const version = await this.createVersion(record!, executor);
    return { record: record!, version };
  }

  async update(
    institutionId: string,
    id: string,
    input: UpdateLessonPackageRequest,
    executor: DatabaseTransaction,
  ) {
    const { expectedRevision, saleStartsAt, saleEndsAt, ...changes } = input;
    const [record] = await executor
      .update(lessonPackageTemplates)
      .set({
        ...changes,
        ...(saleStartsAt === undefined ? {} : { saleStartsAt: this.toDate(saleStartsAt) }),
        ...(saleEndsAt === undefined ? {} : { saleEndsAt: this.toDate(saleEndsAt) }),
        revision: expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonPackageTemplates.id, id),
          eq(lessonPackageTemplates.institutionId, institutionId),
          eq(lessonPackageTemplates.revision, expectedRevision),
        ),
      )
      .returning();
    if (!record) return null;
    const version = await this.createVersion(record, executor);
    return { record, version };
  }

  async findByOrigin(
    institutionId: string,
    originType: 'group_formation',
    originId: string,
    executor: DatabaseExecutor = this.database.db,
  ) {
    const [record] = await executor
      .select()
      .from(lessonPackageTemplates)
      .where(
        and(
          eq(lessonPackageTemplates.institutionId, institutionId),
          eq(lessonPackageTemplates.originType, originType),
          eq(lessonPackageTemplates.originId, originId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async createInternal(input: CreateInternalLessonPackageInput, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(lessonPackageTemplates)
      .values({
        institutionId: input.institutionId,
        name: input.name,
        description: input.description,
        saleScope: 'internal',
        originType: input.originType,
        originId: input.originId,
        baseUnits: input.baseUnits,
        bonusUnits: input.bonusUnits,
        priceAmount: input.priceAmount,
        currency: 'CNY',
        onlineSaleEnabled: false,
        saleStartsAt: null,
        saleEndsAt: null,
        status: 'active',
      })
      .onConflictDoNothing({
        target: [
          lessonPackageTemplates.institutionId,
          lessonPackageTemplates.originType,
          lessonPackageTemplates.originId,
        ],
      })
      .returning();
    if (record) {
      return { record, created: true, version: await this.createVersion(record, executor) };
    }

    const existing = await this.findByOrigin(
      input.institutionId,
      input.originType,
      input.originId,
      executor,
    );
    if (!existing) return { record: null, created: false, version: null };
    return {
      record: existing,
      created: false,
      version: await this.findVersion(existing.id, existing.revision, executor),
    };
  }

  private async createVersion(record: LessonPackageRecord, executor: DatabaseTransaction) {
    const [version] = await executor
      .insert(lessonPackageVersions)
      .values({
        packageId: record.id,
        institutionId: record.institutionId,
        version: record.revision,
        name: record.name,
        description: record.description,
        saleScope: record.saleScope,
        originType: record.originType,
        originId: record.originId,
        baseUnits: record.baseUnits,
        bonusUnits: record.bonusUnits,
        priceAmount: record.priceAmount,
        currency: record.currency,
        onlineSaleEnabled: record.onlineSaleEnabled,
        saleStartsAt: record.saleStartsAt,
        saleEndsAt: record.saleEndsAt,
        status: record.status,
      })
      .returning();
    return version!;
  }

  private toDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
  }
}
