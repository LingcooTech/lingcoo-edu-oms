import { ApiError } from '@lingcoo-tech/http';
import type {
  CreateLessonPackageRequest,
  LessonPackage,
  LessonPackageListQuery,
  UpdateLessonPackageRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { LessonPackageVersionSnapshot } from '../domain/model.js';
import { assertValidLessonPackageOnlineSaleWindow } from '../domain/online-sale.js';
import {
  LessonProductsRepository,
  type LessonPackageRecord,
} from '../infrastructure/persistence/lesson-products.repository.js';

export interface EnsureInternalLessonPackageForFormationInput {
  institutionId: string;
  formationId: string;
  name: string;
  description: string | null;
  baseUnits: number;
  bonusUnits?: number;
  priceAmount: number;
}

export interface LessonPackageDirectory {
  listPurchasable(institutionId: string, now?: Date): Promise<LessonPackage[]>;
  getVersion(
    institutionId: string,
    packageId: string,
    version: number,
    executor: DatabaseExecutor,
  ): Promise<LessonPackageVersionSnapshot>;
  getActiveVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
  ): Promise<LessonPackageVersionSnapshot>;
  getPurchasableVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
    now?: Date,
  ): Promise<LessonPackageVersionSnapshot>;
}

export interface LessonPackageIssuer {
  ensureInternalPackageForFormation(
    input: EnsureInternalLessonPackageForFormationInput,
    context: AuditContext,
  ): Promise<LessonPackageVersionSnapshot>;
}

export class LessonProductsService implements LessonPackageDirectory, LessonPackageIssuer {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: LessonProductsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly audit: AuditWriter,
  ) {}

  async list(institutionId: string, input: LessonPackageListQuery) {
    const result = await this.repository.list(institutionId, input);
    return {
      items: result.items.map((record) => this.view(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async get(institutionId: string, packageId: string): Promise<LessonPackage> {
    const record = await this.repository.findForInstitution(institutionId, packageId);
    if (!record) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
    return this.view(record);
  }

  async listPurchasable(institutionId: string, now: Date = new Date()): Promise<LessonPackage[]> {
    const records = await this.repository.listPurchasable(institutionId, now);
    return records.map((record) => this.view(record));
  }

  async ensureInternalPackageForFormation(
    input: EnsureInternalLessonPackageForFormationInput,
    context: AuditContext,
  ): Promise<LessonPackageVersionSnapshot> {
    this.assertInternalPackageInput(input);
    return this.database.transaction(async (transaction) => {
      await this.institutions.assertActiveInstitution(input.institutionId, transaction);
      const existing = await this.repository.findByOrigin(
        input.institutionId,
        'group_formation',
        input.formationId,
        transaction,
      );
      if (existing) {
        this.assertInternalPackage(existing, input);
        const version = await this.repository.findVersion(
          existing.id,
          existing.revision,
          transaction,
        );
        if (!version) {
          throw new ApiError(409, 'LESSON_PACKAGE_VERSION_MISSING', '课时包版本快照缺失');
        }
        await this.auditInternalPackage(context, existing.id, input, false, transaction);
        return version;
      }

      const result = await this.repository.createInternal(
        {
          institutionId: input.institutionId,
          originType: 'group_formation',
          originId: input.formationId,
          name: input.name,
          description: input.description,
          baseUnits: input.baseUnits,
          bonusUnits: input.bonusUnits ?? 0,
          priceAmount: input.priceAmount,
        },
        transaction,
      );
      if (!result.record || !result.version) {
        throw new ApiError(
          409,
          'LESSON_PACKAGE_INTERNAL_SOURCE_CONFLICT',
          '内部课时包来源创建冲突',
        );
      }
      this.assertInternalPackage(result.record, input);
      await this.auditInternalPackage(
        context,
        result.record.id,
        input,
        result.created,
        transaction,
      );
      return result.version;
    });
  }

  async getActiveVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
  ): Promise<LessonPackageVersionSnapshot> {
    const { record, version } = await this.currentVersion(institutionId, packageId, executor);
    if (record.status !== 'active') {
      throw new ApiError(409, 'LESSON_PACKAGE_INACTIVE', '课时包已停用，不能用于发放');
    }
    if (record.saleScope !== 'public') {
      throw new ApiError(
        409,
        'LESSON_PACKAGE_INTERNAL_NOT_SALEABLE',
        '系统生成的内部课时包不能用于普通售卖或手工发放',
      );
    }
    return version;
  }

  async getVersion(
    institutionId: string,
    packageId: string,
    version: number,
    executor: DatabaseExecutor,
  ): Promise<LessonPackageVersionSnapshot> {
    const record = await this.repository.findForInstitution(institutionId, packageId, executor);
    if (!record) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
    const snapshot = await this.repository.findVersion(record.id, version, executor);
    if (!snapshot) {
      throw new ApiError(404, 'LESSON_PACKAGE_VERSION_NOT_FOUND', '课时包版本快照不存在');
    }
    return snapshot;
  }

  async getPurchasableVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
    now: Date = new Date(),
  ): Promise<LessonPackageVersionSnapshot> {
    const { record, version } = await this.currentVersion(institutionId, packageId, executor);
    if (record.status !== 'active') {
      throw new ApiError(409, 'LESSON_PACKAGE_INACTIVE', '课时包已停用，不能在线购买');
    }
    if (!record.onlineSaleEnabled) {
      throw new ApiError(409, 'LESSON_PACKAGE_ONLINE_SALE_DISABLED', '课时包暂未开放线上购买');
    }
    if (record.priceAmount <= 0) {
      throw new ApiError(
        409,
        'LESSON_PACKAGE_PRICE_INVALID',
        '线上可售课时包必须设置大于 0 的价格',
      );
    }
    if (record.saleStartsAt && now.getTime() < record.saleStartsAt.getTime()) {
      throw new ApiError(409, 'LESSON_PACKAGE_SALE_NOT_STARTED', '课时包线上销售尚未开始');
    }
    if (record.saleEndsAt && now.getTime() >= record.saleEndsAt.getTime()) {
      throw new ApiError(409, 'LESSON_PACKAGE_SALE_ENDED', '课时包线上销售已结束');
    }
    return version;
  }

  async create(
    institutionId: string,
    input: CreateLessonPackageRequest,
    context: AuditContext,
  ): Promise<LessonPackage> {
    try {
      return await this.database.transaction(async (transaction) => {
        await this.institutions.assertActiveInstitution(institutionId, transaction);
        this.assertSaleWindow(input.saleStartsAt, input.saleEndsAt);
        this.assertOnlineSalePrice(input.onlineSaleEnabled ?? false, input.priceAmount ?? 0);
        const { record } = await this.repository.create({ ...input, institutionId }, transaction);
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-package.created',
            resourceType: 'lesson.package',
            resourceId: record.id,
            changes: [
              { field: 'institutionId', before: null, after: institutionId },
              { field: 'name', before: null, after: record.name },
              { field: 'baseUnits', before: null, after: record.baseUnits },
              { field: 'bonusUnits', before: null, after: record.bonusUnits },
              { field: 'priceAmount', before: null, after: record.priceAmount },
              { field: 'onlineSaleEnabled', before: null, after: record.onlineSaleEnabled },
            ],
          },
          transaction,
        );
        return this.view(record);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  async update(
    institutionId: string,
    packageId: string,
    input: UpdateLessonPackageRequest,
    context: AuditContext,
  ): Promise<LessonPackage> {
    try {
      return await this.database.transaction(async (transaction) => {
        const before = await this.repository.findForInstitution(
          institutionId,
          packageId,
          transaction,
        );
        if (!before) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
        if (before.saleScope === 'internal') {
          throw new ApiError(
            409,
            'LESSON_PACKAGE_INTERNAL_READONLY',
            '内部来源课时包只能由来源业务用例维护',
          );
        }
        this.assertSaleWindow(
          input.saleStartsAt === undefined ? before.saleStartsAt : input.saleStartsAt,
          input.saleEndsAt === undefined ? before.saleEndsAt : input.saleEndsAt,
        );
        this.assertOnlineSalePrice(
          input.onlineSaleEnabled ?? before.onlineSaleEnabled,
          input.priceAmount ?? before.priceAmount,
        );
        const updated = await this.repository.update(institutionId, packageId, input, transaction);
        if (!updated) {
          throw new ApiError(409, 'LESSON_PACKAGE_VERSION_CONFLICT', '课时包已被其他操作更新');
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-package.updated',
            resourceType: 'lesson.package',
            resourceId: packageId,
            changes: Object.entries(input)
              .filter(([field]) => field !== 'expectedRevision')
              .map(([field, after]) => ({
                field,
                before: this.auditValue(before[field as keyof LessonPackageRecord]),
                after: after ?? null,
              })),
          },
          transaction,
        );
        return this.view(updated.record);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  private view(record: LessonPackageRecord): LessonPackage {
    return {
      ...record,
      saleStartsAt: record.saleStartsAt?.toISOString() ?? null,
      saleEndsAt: record.saleEndsAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private assertSaleWindow(
    saleStartsAt: string | Date | null | undefined,
    saleEndsAt: string | Date | null | undefined,
  ): void {
    assertValidLessonPackageOnlineSaleWindow({
      saleStartsAt: this.toDate(saleStartsAt),
      saleEndsAt: this.toDate(saleEndsAt),
    });
  }

  private assertOnlineSalePrice(enabled: boolean, priceAmount: number): void {
    if (enabled && priceAmount <= 0) {
      throw new ApiError(
        400,
        'LESSON_PACKAGE_PRICE_INVALID',
        '线上可售课时包必须设置大于 0 的价格',
      );
    }
  }

  private assertInternalPackageInput(
    input: EnsureInternalLessonPackageForFormationInput,
  ): asserts input is EnsureInternalLessonPackageForFormationInput & { bonusUnits: number } {
    if (!input.name.trim() || input.name.length > 160) {
      throw new ApiError(400, 'LESSON_PACKAGE_NAME_INVALID', '内部课时包名称无效');
    }
    if (!Number.isInteger(input.baseUnits) || input.baseUnits <= 0) {
      throw new ApiError(400, 'LESSON_PACKAGE_UNITS_INVALID', '基础课时必须为正整数');
    }
    const bonusUnits = input.bonusUnits ?? 0;
    if (!Number.isInteger(bonusUnits) || bonusUnits < 0) {
      throw new ApiError(400, 'LESSON_PACKAGE_UNITS_INVALID', '赠送课时必须为非负整数');
    }
    if (!Number.isInteger(input.priceAmount) || input.priceAmount < 0) {
      throw new ApiError(400, 'LESSON_PACKAGE_PRICE_INVALID', '课时包价格必须为非负整数');
    }
  }

  private assertInternalPackage(
    record: LessonPackageRecord,
    input: EnsureInternalLessonPackageForFormationInput,
  ): void {
    if (
      record.saleScope !== 'internal' ||
      record.originType !== 'group_formation' ||
      record.originId !== input.formationId
    ) {
      throw new ApiError(409, 'LESSON_PACKAGE_INTERNAL_SOURCE_CONFLICT', '课时包来源不一致');
    }
    if (
      record.baseUnits !== input.baseUnits ||
      record.bonusUnits !== (input.bonusUnits ?? 0) ||
      record.priceAmount !== input.priceAmount
    ) {
      throw new ApiError(
        409,
        'LESSON_PACKAGE_INTERNAL_DEFINITION_CONFLICT',
        '同一成班来源的课时、赠送课时或金额不可变更',
      );
    }
  }

  private async auditInternalPackage(
    context: AuditContext,
    packageId: string,
    input: EnsureInternalLessonPackageForFormationInput,
    created: boolean,
    transaction: DatabaseTransaction,
  ): Promise<void> {
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: created ? 'lesson-package.internal-created' : 'lesson-package.internal-reused',
        resourceType: 'lesson.package',
        resourceId: packageId,
        changes: created
          ? [
              { field: 'originType', before: null, after: 'group_formation' },
              { field: 'originId', before: null, after: input.formationId },
            ]
          : [],
        metadata: {
          formationId: input.formationId,
          baseUnits: input.baseUnits,
          bonusUnits: input.bonusUnits ?? 0,
          priceAmount: input.priceAmount,
        },
      },
      transaction,
    );
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
  }

  private auditValue(value: unknown): unknown {
    return value instanceof Date ? value.toISOString() : (value ?? null);
  }

  private async currentVersion(
    institutionId: string,
    packageId: string,
    executor: DatabaseExecutor,
  ): Promise<{ record: LessonPackageRecord; version: LessonPackageVersionSnapshot }> {
    const record = await this.repository.findForInstitution(institutionId, packageId, executor);
    if (!record) throw new ApiError(404, 'LESSON_PACKAGE_NOT_FOUND', '课时包不存在');
    const version = await this.repository.findVersion(record.id, record.revision, executor);
    if (!version) {
      throw new ApiError(409, 'LESSON_PACKAGE_VERSION_MISSING', '课时包版本快照缺失');
    }
    return { record, version };
  }

  private translateConflict(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ApiError(409, 'LESSON_PACKAGE_NAME_EXISTS', '该机构已存在同名课时包');
    }
  }
}
