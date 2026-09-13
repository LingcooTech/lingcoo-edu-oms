import { ApiError } from '@lingcoo-tech/http';
import {
  periodCardEntitlementSchema,
  periodCardMutationResultSchema,
  periodCardProductSchema,
  type CreatePeriodCardProductRequest,
  type IssuePeriodCardEntitlementRequest,
  type PeriodCardEntitlement,
  type PeriodCardEntitlementListQuery,
  type PeriodCardMutationResult,
  type PeriodCardProduct,
  type PeriodCardProductListQuery,
  type PeriodCardUsage,
  type PeriodCardUsageListQuery,
  type ReversePeriodCardUsageRequest,
  type RevokePeriodCardEntitlementRequest,
  type UpdatePeriodCardProductRequest,
  type UsePeriodCardRequest,
} from '@lingcoo-edu-oms/contracts';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { IdempotencyService } from '../../idempotency/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { StudentDirectory } from '../../people/public.js';
import {
  addPeriodDurationUtc,
  effectivePeriodCardStatus,
  type PeriodCardMutationActor,
  type PeriodCardProductVersionSnapshot,
  type PeriodCardUsageReversalCommand,
  type PeriodCardUseCommand,
} from '../domain/model.js';
import {
  PeriodCardsRepository,
  type PeriodCardEntitlementRecord,
  type PeriodCardProductRecord,
  type PeriodCardUsageRecord,
} from '../infrastructure/persistence/period-cards.repository.js';

export interface PeriodCardConsumptionPort {
  useInTransaction(
    input: PeriodCardUseCommand,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardMutationResult>;
  reverseInTransaction(
    input: PeriodCardUsageReversalCommand,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardMutationResult>;
}

export interface PeriodCardIssueCommand {
  institutionId: string;
  studentId: string;
  productId: string;
  /** Orders pin the version purchased at checkout; manual issue uses the current version. */
  productVersion?: number;
  operationId: string;
  activationStartsAt?: Date | null;
  reason?: string | null;
  sourceType: 'manual' | 'order';
  sourceReference: string | null;
}

export interface PeriodCardEntitlementIssuer {
  issueInTransaction(
    input: PeriodCardIssueCommand,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardEntitlement>;
  getEntitlement(institutionId: string, entitlementId: string): Promise<PeriodCardEntitlement>;
  revoke(
    institutionId: string,
    entitlementId: string,
    input: RevokePeriodCardEntitlementRequest,
    context: PeriodCardMutationActor,
  ): Promise<PeriodCardEntitlement>;
}

export interface PeriodCardProductDirectory {
  listPurchasable(institutionId: string, now?: Date): Promise<PeriodCardProduct[]>;
  getActiveVersion(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor,
  ): Promise<PeriodCardProductVersionSnapshot>;
  getPurchasableVersion(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor,
    now?: Date,
  ): Promise<PeriodCardProductVersionSnapshot>;
  getVersion(
    institutionId: string,
    productId: string,
    version: number,
    executor: DatabaseExecutor,
  ): Promise<PeriodCardProductVersionSnapshot>;
}

export class PeriodCardsService
  implements PeriodCardConsumptionPort, PeriodCardEntitlementIssuer, PeriodCardProductDirectory
{
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: PeriodCardsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly students: StudentDirectory,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async listProducts(institutionId: string, input: PeriodCardProductListQuery) {
    const result = await this.repository.listProducts(institutionId, input);
    return {
      items: result.items.map((record) => this.productView(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async getProduct(institutionId: string, productId: string): Promise<PeriodCardProduct> {
    const record = await this.repository.findProductForInstitution(institutionId, productId);
    if (!record) throw new ApiError(404, 'PERIOD_CARD_PRODUCT_NOT_FOUND', '周期卡商品不存在');
    return this.productView(record);
  }

  async listPurchasable(
    institutionId: string,
    now: Date = this.clock(),
  ): Promise<PeriodCardProduct[]> {
    const records = await this.repository.listPurchasableProducts(institutionId, now);
    return records.map((record) => this.productView(record));
  }

  async createProduct(
    institutionId: string,
    input: CreatePeriodCardProductRequest,
    idempotencyKey: string,
    context: AuditContext,
  ): Promise<PeriodCardProduct> {
    this.assertProductRules(input);
    try {
      const result = await this.idempotency.execute(
        { operation: 'period-card-product.create', resultSchema: periodCardProductSchema },
        {
          scope: `period-card-products:${institutionId}`,
          key: idempotencyKey,
          request: { institutionId, input },
          actorId: context.actorId,
        },
        async (transaction) => {
          await this.institutions.assertActiveInstitution(institutionId, transaction);
          const { record } = await this.repository.createProduct(institutionId, input, transaction);
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'period-card-product.created',
              resourceType: 'period-card.product',
              resourceId: record.id,
              changes: [
                { field: 'institutionId', before: null, after: institutionId },
                { field: 'name', before: null, after: record.name },
                { field: 'mode', before: null, after: record.mode },
                { field: 'usageLimit', before: null, after: record.usageLimit },
                { field: 'durationUnit', before: null, after: record.durationUnit },
                { field: 'durationCount', before: null, after: record.durationCount },
              ],
            },
            transaction,
          );
          return this.productView(record);
        },
      );
      return result.value;
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async updateProduct(
    institutionId: string,
    productId: string,
    input: UpdatePeriodCardProductRequest,
    idempotencyKey: string,
    context: AuditContext,
  ): Promise<PeriodCardProduct> {
    try {
      const result = await this.idempotency.execute(
        { operation: 'period-card-product.update', resultSchema: periodCardProductSchema },
        {
          scope: `period-card-product:${institutionId}:${productId}`,
          key: idempotencyKey,
          request: { institutionId, productId, input },
          actorId: context.actorId,
        },
        async (transaction) => {
          const before = await this.requireProduct(institutionId, productId, transaction);
          const final = {
            mode: input.mode ?? before.mode,
            usageLimit:
              input.usageLimit !== undefined
                ? input.usageLimit
                : input.mode === 'unlimited'
                  ? null
                  : before.usageLimit,
            priceAmount: input.priceAmount ?? before.priceAmount,
            onlineSaleEnabled: input.onlineSaleEnabled ?? before.onlineSaleEnabled,
            saleStartsAt:
              input.saleStartsAt === undefined ? before.saleStartsAt : input.saleStartsAt,
            saleEndsAt: input.saleEndsAt === undefined ? before.saleEndsAt : input.saleEndsAt,
          };
          this.assertProductRules(final);
          const normalizedUsageLimit = final.mode === 'unlimited' ? null : final.usageLimit;
          const updated = await this.repository.updateProduct(
            institutionId,
            productId,
            input,
            normalizedUsageLimit,
            transaction,
          );
          if (!updated) {
            throw new ApiError(
              409,
              'PERIOD_CARD_PRODUCT_VERSION_CONFLICT',
              '周期卡商品已被其他操作更新，请刷新后重试',
            );
          }
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'period-card-product.updated',
              resourceType: 'period-card.product',
              resourceId: productId,
              changes: Object.entries(input)
                .filter(([field]) => field !== 'expectedRevision')
                .map(([field, after]) => ({
                  field,
                  before: this.auditValue(before[field as keyof PeriodCardProductRecord]),
                  after: after ?? null,
                })),
            },
            transaction,
          );
          return this.productView(updated.record);
        },
      );
      return result.value;
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async listEntitlements(institutionId: string, input: PeriodCardEntitlementListQuery) {
    const now = this.clock();
    const result = await this.repository.listEntitlements(institutionId, input, now);
    return {
      items: result.items.map((record) => this.entitlementView(record, now)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async getEntitlement(
    institutionId: string,
    entitlementId: string,
  ): Promise<PeriodCardEntitlement> {
    const record = await this.repository.findEntitlement(institutionId, entitlementId);
    if (!record) throw new ApiError(404, 'PERIOD_CARD_ENTITLEMENT_NOT_FOUND', '周期卡权益不存在');
    return this.entitlementView(record, this.clock());
  }

  async issue(
    institutionId: string,
    input: IssuePeriodCardEntitlementRequest,
    context: PeriodCardMutationActor,
  ): Promise<PeriodCardEntitlement> {
    try {
      const result = await this.idempotency.execute(
        { operation: 'period-card-entitlement.issue', resultSchema: periodCardEntitlementSchema },
        {
          scope: `period-card-entitlements:${institutionId}:${input.studentId}`,
          key: input.operationId,
          request: { institutionId, input },
          actorId: context.actorId,
        },
        (transaction) =>
          this.issueInTransaction(
            {
              institutionId,
              studentId: input.studentId,
              productId: input.productId,
              operationId: input.operationId,
              activationStartsAt: input.activationStartsAt
                ? new Date(input.activationStartsAt)
                : null,
              reason: input.reason,
              sourceType: 'manual',
              sourceReference: `manual-issue:${input.operationId}`,
            },
            context,
            transaction,
          ),
      );
      return result.value;
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async issueInTransaction(
    input: PeriodCardIssueCommand,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardEntitlement> {
    if (input.sourceType === 'order' && !input.sourceReference) {
      throw new ApiError(
        400,
        'PERIOD_CARD_ORDER_SOURCE_REQUIRED',
        '订单发放周期卡必须提供来源编号',
      );
    }
    if (input.sourceType === 'order' && input.productVersion === undefined) {
      throw new ApiError(
        400,
        'PERIOD_CARD_ORDER_VERSION_REQUIRED',
        '订单发放周期卡必须提供购买时的商品版本',
      );
    }
    await this.institutions.assertActiveInstitution(input.institutionId, transaction);
    const student = await this.students.getActiveStudentSnapshot(
      input.studentId,
      input.institutionId,
      transaction,
    );
    const version =
      input.productVersion === undefined
        ? await this.getActiveVersion(input.institutionId, input.productId, transaction)
        : await this.getVersion(
            input.institutionId,
            input.productId,
            input.productVersion,
            transaction,
          );
    if (version.activationPolicy === 'on_first_use' && input.activationStartsAt) {
      throw new ApiError(
        400,
        'PERIOD_CARD_ACTIVATION_START_NOT_ALLOWED',
        '首次使用激活的周期卡不能预设生效时间',
      );
    }
    const issuedAt = this.clock();
    const activationStartsAt =
      version.activationPolicy === 'immediate' ? (input.activationStartsAt ?? issuedAt) : null;
    const endsAt = activationStartsAt
      ? addPeriodDurationUtc(activationStartsAt, version.durationUnit, version.durationCount)
      : null;
    const record = await this.repository.insertEntitlement(
      {
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentNameSnapshot: student.fullName,
        productId: version.productId,
        productVersionId: version.id,
        productVersion: version.version,
        productNameSnapshot: version.name,
        mode: version.mode,
        usageLimit: version.usageLimit,
        durationUnit: version.durationUnit,
        durationCount: version.durationCount,
        activationPolicy: version.activationPolicy,
        activationStartsAt,
        endsAt,
        issuedAt,
        issuedBy: context.actorId,
        issueOperationId: input.operationId,
        sourceType: input.sourceType,
        sourceReference: input.sourceReference,
        issuedReason: input.reason ?? null,
      },
      transaction,
    );
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: 'period-card-entitlement.issued',
        resourceType: 'period-card.entitlement',
        resourceId: record.id,
        changes: [
          { field: 'studentId', before: null, after: input.studentId },
          { field: 'productVersionId', before: null, after: version.id },
          {
            field: 'activationStartsAt',
            before: null,
            after: activationStartsAt?.toISOString() ?? null,
          },
          { field: 'endsAt', before: null, after: endsAt?.toISOString() ?? null },
        ],
        metadata: { operationId: input.operationId, sourceType: input.sourceType },
      },
      transaction,
    );
    return this.entitlementView(record, issuedAt);
  }

  async revoke(
    institutionId: string,
    entitlementId: string,
    input: RevokePeriodCardEntitlementRequest,
    context: PeriodCardMutationActor,
  ): Promise<PeriodCardEntitlement> {
    try {
      const result = await this.idempotency.execute(
        { operation: 'period-card-entitlement.revoke', resultSchema: periodCardEntitlementSchema },
        {
          scope: `period-card-entitlement:${institutionId}:${entitlementId}`,
          key: input.operationId,
          request: { institutionId, entitlementId, input },
          actorId: context.actorId,
        },
        async (transaction) => {
          const entitlement = await this.requireEntitlementForUpdate(
            institutionId,
            entitlementId,
            transaction,
          );
          if (entitlement.lifecycleState === 'revoked') {
            throw new ApiError(409, 'PERIOD_CARD_ENTITLEMENT_ALREADY_REVOKED', '周期卡权益已撤销');
          }
          if (entitlement.usedQuantity > 0) {
            throw new ApiError(
              409,
              'PERIOD_CARD_ENTITLEMENT_ALREADY_USED',
              '周期卡已经使用，不能直接撤销或自动退款',
            );
          }
          if (entitlement.revision !== input.expectedRevision) {
            this.versionConflict('周期卡权益');
          }
          const revokedAt = this.clock();
          const updated = await this.repository.revokeEntitlement(
            entitlement,
            {
              operationId: input.operationId,
              reason: input.reason,
              actorId: context.actorId,
              revokedAt,
            },
            transaction,
          );
          if (!updated) this.versionConflict('周期卡权益');
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'period-card-entitlement.revoked',
              resourceType: 'period-card.entitlement',
              resourceId: entitlement.id,
              changes: [{ field: 'lifecycleState', before: 'active', after: 'revoked' }],
              metadata: { operationId: input.operationId, reason: input.reason },
            },
            transaction,
          );
          return this.entitlementView(updated!, revokedAt);
        },
      );
      return result.value;
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async listUsages(institutionId: string, input: PeriodCardUsageListQuery) {
    const result = await this.repository.listUsages(institutionId, input);
    return {
      items: result.items.map((record) => this.usageView(record)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async use(
    institutionId: string,
    input: UsePeriodCardRequest,
    context: PeriodCardMutationActor,
  ): Promise<PeriodCardMutationResult> {
    try {
      const result = await this.idempotency.execute(
        { operation: 'period-card.use', resultSchema: periodCardMutationResultSchema },
        {
          scope: `period-card-entitlement:${institutionId}:${input.entitlementId}`,
          key: input.operationId,
          request: { institutionId, input },
          actorId: context.actorId,
        },
        (transaction) =>
          this.useLocked(
            {
              institutionId,
              entitlementId: input.entitlementId,
              quantity: input.quantity,
              sourceReference: input.sourceReference,
              occurredAt: new Date(input.occurredAt),
              operationId: input.operationId,
              reason: input.reason,
            },
            undefined,
            context,
            transaction,
          ),
      );
      return result.value;
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async useInTransaction(
    input: PeriodCardUseCommand,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardMutationResult> {
    try {
      return await this.useLocked(input, input.studentId, context, transaction);
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  private async useLocked(
    input: Omit<PeriodCardUseCommand, 'studentId'> & { studentId?: string },
    expectedStudentId: string | undefined,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardMutationResult> {
    const entitlement = await this.requireEntitlementForUpdate(
      input.institutionId,
      input.entitlementId,
      transaction,
    );
    if (expectedStudentId && entitlement.studentId !== expectedStudentId) {
      throw new ApiError(409, 'PERIOD_CARD_STUDENT_MISMATCH', '周期卡权益不属于当前学员');
    }
    await this.students.assertActiveStudentInstitution(
      entitlement.studentId,
      input.institutionId,
      transaction,
    );
    if (entitlement.lifecycleState === 'revoked') {
      throw new ApiError(409, 'PERIOD_CARD_ENTITLEMENT_REVOKED', '周期卡权益已撤销，不能使用');
    }
    let activation: { startsAt: Date; endsAt: Date } | null = null;
    let startsAt = entitlement.activationStartsAt;
    let endsAt = entitlement.endsAt;
    if (!startsAt || !endsAt) {
      if (entitlement.activationPolicy !== 'on_first_use') {
        throw new ApiError(409, 'PERIOD_CARD_ACTIVATION_INVALID', '周期卡生效区间不完整');
      }
      startsAt = input.occurredAt;
      endsAt = addPeriodDurationUtc(startsAt, entitlement.durationUnit, entitlement.durationCount);
      activation = { startsAt, endsAt };
    }
    if (input.occurredAt.getTime() < startsAt.getTime()) {
      throw new ApiError(409, 'PERIOD_CARD_NOT_STARTED', '服务发生时间早于周期卡生效时间');
    }
    if (input.occurredAt.getTime() >= endsAt.getTime()) {
      throw new ApiError(409, 'PERIOD_CARD_EXPIRED', '服务发生时间不在周期卡有效期内');
    }
    if (
      entitlement.mode === 'limited' &&
      entitlement.usageLimit !== null &&
      entitlement.usedQuantity + input.quantity > entitlement.usageLimit
    ) {
      throw new ApiError(409, 'PERIOD_CARD_USAGE_LIMIT_EXCEEDED', '本次使用超过周期卡剩余次数', {
        usageLimit: entitlement.usageLimit,
        usedQuantity: entitlement.usedQuantity,
        requestedQuantity: input.quantity,
      });
    }
    const updated = await this.repository.incrementUsage(
      entitlement,
      input.quantity,
      activation,
      transaction,
    );
    if (!updated) this.versionConflict('周期卡权益');
    const usage = await this.repository.insertUsage(
      {
        institutionId: entitlement.institutionId,
        entitlementId: entitlement.id,
        studentId: entitlement.studentId,
        studentNameSnapshot: entitlement.studentNameSnapshot,
        productNameSnapshot: entitlement.productNameSnapshot,
        sourceReference: input.sourceReference,
        quantity: input.quantity,
        occurredAt: input.occurredAt,
        reason: input.reason ?? null,
        operationId: input.operationId,
        createdBy: context.actorId,
      },
      transaction,
    );
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: 'period-card.used',
        resourceType: 'period-card.usage',
        resourceId: usage.id,
        changes: [
          {
            field: 'usedQuantity',
            before: entitlement.usedQuantity,
            after: updated!.usedQuantity,
          },
        ],
        metadata: {
          entitlementId: entitlement.id,
          operationId: input.operationId,
          sourceReference: input.sourceReference,
          occurredAt: input.occurredAt.toISOString(),
        },
      },
      transaction,
    );
    return {
      entitlement: this.entitlementView(updated!, input.occurredAt),
      usage: this.usageView(usage),
    };
  }

  async reverse(
    institutionId: string,
    usageId: string,
    input: ReversePeriodCardUsageRequest,
    context: PeriodCardMutationActor,
  ): Promise<PeriodCardMutationResult> {
    try {
      const result = await this.idempotency.execute(
        { operation: 'period-card.use-reversal', resultSchema: periodCardMutationResultSchema },
        {
          scope: `period-card-usage:${institutionId}:${usageId}`,
          key: input.operationId,
          request: { institutionId, usageId, input },
          actorId: context.actorId,
        },
        (transaction) =>
          this.reverseInTransaction(
            { institutionId, usageId, operationId: input.operationId, reason: input.reason },
            context,
            transaction,
          ),
      );
      return result.value;
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async reverseInTransaction(
    input: PeriodCardUsageReversalCommand,
    context: PeriodCardMutationActor,
    transaction: DatabaseTransaction,
  ): Promise<PeriodCardMutationResult> {
    try {
      const usage = await this.repository.findUsageForUpdate(
        input.institutionId,
        input.usageId,
        transaction,
      );
      if (!usage) throw new ApiError(404, 'PERIOD_CARD_USAGE_NOT_FOUND', '周期卡使用记录不存在');
      if (usage.status === 'reversed') {
        throw new ApiError(409, 'PERIOD_CARD_USAGE_ALREADY_REVERSED', '周期卡使用记录已冲正');
      }
      const entitlement = await this.requireEntitlementForUpdate(
        input.institutionId,
        usage.entitlementId,
        transaction,
      );
      if (entitlement.studentId !== usage.studentId) {
        throw new ApiError(409, 'PERIOD_CARD_USAGE_OWNERSHIP_INVALID', '周期卡使用记录归属异常');
      }
      if (entitlement.usedQuantity < usage.quantity) {
        throw new ApiError(
          409,
          'PERIOD_CARD_USAGE_PROJECTION_INVALID',
          '周期卡累计使用次数不足以冲正',
        );
      }
      const updatedEntitlement = await this.repository.decrementUsage(
        entitlement,
        usage.quantity,
        transaction,
      );
      if (!updatedEntitlement) this.versionConflict('周期卡权益');
      const reversedAt = this.clock();
      const reversedUsage = await this.repository.reverseUsage(
        usage,
        {
          operationId: input.operationId,
          reason: input.reason,
          actorId: context.actorId,
          reversedAt,
        },
        transaction,
      );
      if (!reversedUsage) {
        throw new ApiError(409, 'PERIOD_CARD_USAGE_ALREADY_REVERSED', '周期卡使用记录已冲正');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'period-card.usage-reversed',
          resourceType: 'period-card.usage',
          resourceId: usage.id,
          changes: [
            { field: 'status', before: 'active', after: 'reversed' },
            {
              field: 'usedQuantity',
              before: entitlement.usedQuantity,
              after: updatedEntitlement!.usedQuantity,
            },
          ],
          metadata: { entitlementId: entitlement.id, operationId: input.operationId },
        },
        transaction,
      );
      return {
        entitlement: this.entitlementView(updatedEntitlement!, reversedAt),
        usage: this.usageView(reversedUsage),
      };
    } catch (error) {
      this.translateDatabaseError(error);
    }
  }

  async getVersion(
    institutionId: string,
    productId: string,
    version: number,
    executor: DatabaseExecutor,
  ): Promise<PeriodCardProductVersionSnapshot> {
    const product = await this.repository.findProductForInstitution(
      institutionId,
      productId,
      executor,
    );
    if (!product) throw new ApiError(404, 'PERIOD_CARD_PRODUCT_NOT_FOUND', '周期卡商品不存在');
    const snapshot = await this.repository.findProductVersion(productId, version, executor);
    if (!snapshot || snapshot.institutionId !== institutionId) {
      throw new ApiError(404, 'PERIOD_CARD_PRODUCT_VERSION_NOT_FOUND', '周期卡商品版本不存在');
    }
    return snapshot;
  }

  async getActiveVersion(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor,
  ): Promise<PeriodCardProductVersionSnapshot> {
    const { record, version } = await this.currentProductVersion(
      institutionId,
      productId,
      executor,
    );
    if (record.status !== 'active') {
      throw new ApiError(409, 'PERIOD_CARD_PRODUCT_INACTIVE', '周期卡商品已停用，不能发放');
    }
    return version;
  }

  async getPurchasableVersion(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor,
    now: Date = this.clock(),
  ): Promise<PeriodCardProductVersionSnapshot> {
    const { record, version } = await this.currentProductVersion(
      institutionId,
      productId,
      executor,
    );
    if (record.status !== 'active') {
      throw new ApiError(409, 'PERIOD_CARD_PRODUCT_INACTIVE', '周期卡商品已停用，不能购买');
    }
    if (!record.onlineSaleEnabled) {
      throw new ApiError(409, 'PERIOD_CARD_ONLINE_SALE_DISABLED', '周期卡暂未开放线上购买');
    }
    if (record.priceAmount <= 0) {
      throw new ApiError(409, 'PERIOD_CARD_PRICE_INVALID', '线上可售周期卡必须设置大于 0 的价格');
    }
    if (record.saleStartsAt && now.getTime() < record.saleStartsAt.getTime()) {
      throw new ApiError(409, 'PERIOD_CARD_SALE_NOT_STARTED', '周期卡线上销售尚未开始');
    }
    if (record.saleEndsAt && now.getTime() >= record.saleEndsAt.getTime()) {
      throw new ApiError(409, 'PERIOD_CARD_SALE_ENDED', '周期卡线上销售已结束');
    }
    return version;
  }

  private async currentProductVersion(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor,
  ) {
    const record = await this.requireProduct(institutionId, productId, executor);
    const version = await this.repository.findProductVersion(productId, record.revision, executor);
    if (!version) {
      throw new ApiError(409, 'PERIOD_CARD_PRODUCT_VERSION_MISSING', '周期卡商品版本快照缺失');
    }
    return { record, version };
  }

  private async requireProduct(
    institutionId: string,
    productId: string,
    executor: DatabaseExecutor,
  ) {
    const record = await this.repository.findProductForInstitution(
      institutionId,
      productId,
      executor,
    );
    if (!record) throw new ApiError(404, 'PERIOD_CARD_PRODUCT_NOT_FOUND', '周期卡商品不存在');
    return record;
  }

  private async requireEntitlementForUpdate(
    institutionId: string,
    entitlementId: string,
    transaction: DatabaseTransaction,
  ) {
    const record = await this.repository.findEntitlementForUpdate(
      institutionId,
      entitlementId,
      transaction,
    );
    if (!record) throw new ApiError(404, 'PERIOD_CARD_ENTITLEMENT_NOT_FOUND', '周期卡权益不存在');
    return record;
  }

  private assertProductRules(input: {
    mode: 'limited' | 'unlimited';
    usageLimit?: number | null;
    priceAmount?: number;
    onlineSaleEnabled?: boolean;
    saleStartsAt?: string | Date | null;
    saleEndsAt?: string | Date | null;
  }) {
    if (input.mode === 'limited' && (!input.usageLimit || input.usageLimit <= 0)) {
      throw new ApiError(
        400,
        'PERIOD_CARD_USAGE_LIMIT_REQUIRED',
        '限次周期卡必须设置正整数使用上限',
      );
    }
    if (input.mode === 'unlimited' && input.usageLimit !== null && input.usageLimit !== undefined) {
      throw new ApiError(
        400,
        'PERIOD_CARD_USAGE_LIMIT_NOT_ALLOWED',
        '不限次周期卡不能设置使用上限',
      );
    }
    if (input.onlineSaleEnabled && (input.priceAmount ?? 0) <= 0) {
      throw new ApiError(400, 'PERIOD_CARD_PRICE_INVALID', '线上可售周期卡必须设置大于 0 的价格');
    }
    const startsAt = this.toDate(input.saleStartsAt);
    const endsAt = this.toDate(input.saleEndsAt);
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new ApiError(
        400,
        'PERIOD_CARD_SALE_WINDOW_INVALID',
        '线上销售结束时间必须晚于开始时间',
      );
    }
  }

  private productView(record: PeriodCardProductRecord): PeriodCardProduct {
    return {
      ...record,
      saleStartsAt: record.saleStartsAt?.toISOString() ?? null,
      saleEndsAt: record.saleEndsAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private entitlementView(record: PeriodCardEntitlementRecord, now: Date): PeriodCardEntitlement {
    const activationStartsAt = record.activationStartsAt?.toISOString() ?? null;
    const endsAt = record.endsAt?.toISOString() ?? null;
    return {
      id: record.id,
      institutionId: record.institutionId,
      studentId: record.studentId,
      studentName: record.studentNameSnapshot,
      productId: record.productId,
      productVersionId: record.productVersionId,
      productVersion: record.productVersion,
      productName: record.productNameSnapshot,
      mode: record.mode,
      usageLimit: record.usageLimit,
      usedQuantity: record.usedQuantity,
      remainingQuantity:
        record.mode === 'limited' && record.usageLimit !== null
          ? record.usageLimit - record.usedQuantity
          : null,
      durationUnit: record.durationUnit,
      durationCount: record.durationCount,
      activationPolicy: record.activationPolicy,
      activationStartsAt,
      endsAt,
      issuedAt: record.issuedAt.toISOString(),
      lifecycleState: record.lifecycleState,
      effectiveStatus: effectivePeriodCardStatus(
        {
          lifecycleState: record.lifecycleState,
          activationStartsAt,
          endsAt,
          mode: record.mode,
          usageLimit: record.usageLimit,
          usedQuantity: record.usedQuantity,
        },
        now,
      ),
      sourceType: record.sourceType,
      sourceReference: record.sourceReference,
      issuedReason: record.issuedReason,
      revokedAt: record.revokedAt?.toISOString() ?? null,
      revokedBy: record.revokedBy,
      revocationReason: record.revocationReason,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private usageView(record: PeriodCardUsageRecord): PeriodCardUsage {
    return {
      id: record.id,
      institutionId: record.institutionId,
      entitlementId: record.entitlementId,
      studentId: record.studentId,
      studentName: record.studentNameSnapshot,
      productName: record.productNameSnapshot,
      sourceReference: record.sourceReference,
      quantity: record.quantity,
      status: record.status,
      occurredAt: record.occurredAt.toISOString(),
      reason: record.reason,
      operationId: record.operationId,
      createdBy: record.createdBy,
      reversedAt: record.reversedAt?.toISOString() ?? null,
      reversedBy: record.reversedBy,
      reversalOperationId: record.reversalOperationId,
      reversalReason: record.reversalReason,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private translateDatabaseError(error: unknown): never {
    if (error instanceof ApiError) throw error;
    let databaseError = error as { code?: string; constraint?: string; cause?: unknown };
    for (let depth = 0; depth < 6 && databaseError.cause; depth += 1) {
      if (databaseError.code) break;
      databaseError = databaseError.cause as {
        code?: string;
        constraint?: string;
        cause?: unknown;
      };
    }
    if (databaseError.code === '23505') {
      if (databaseError.constraint === 'period_card_products_institution_name_unique') {
        throw new ApiError(409, 'PERIOD_CARD_PRODUCT_NAME_EXISTS', '该机构已存在同名周期卡商品');
      }
      if (databaseError.constraint === 'period_card_usages_active_source_unique') {
        throw new ApiError(
          409,
          'PERIOD_CARD_USAGE_SOURCE_CONFLICT',
          '该服务来源已有未冲正使用记录',
        );
      }
      if (databaseError.constraint?.includes('operation')) {
        throw new ApiError(409, 'PERIOD_CARD_OPERATION_EXISTS', '该操作编号已经使用');
      }
      if (databaseError.constraint === 'period_card_entitlements_source_identity_unique') {
        throw new ApiError(409, 'PERIOD_CARD_ENTITLEMENT_SOURCE_EXISTS', '该来源已发放周期卡权益');
      }
      throw new ApiError(409, 'PERIOD_CARD_UNIQUE_CONFLICT', '周期卡操作与现有记录冲突');
    }
    if (databaseError.code === '23514' || databaseError.code === '23503') {
      throw new ApiError(409, 'PERIOD_CARD_INVARIANT_VIOLATION', '周期卡数据不满足业务约束');
    }
    throw error;
  }

  private versionConflict(resource: string): never {
    throw new ApiError(
      409,
      'PERIOD_CARD_VERSION_CONFLICT',
      `${resource}已被其他操作更新，请刷新后重试`,
    );
  }

  private auditValue(value: unknown): unknown {
    return value instanceof Date ? value.toISOString() : (value ?? null);
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
  }
}
