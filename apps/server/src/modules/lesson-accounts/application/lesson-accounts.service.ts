import { randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  adjustLessonUnitsResultSchema,
  clawbackLessonUnitsResultSchema,
  grantLessonUnitsResultSchema,
  reverseLessonGrantResultSchema,
  type AdjustLessonUnitsRequest,
  type ClawbackLessonUnitsRequest,
  type GrantLessonUnitsRequest,
  type EducationDataScope,
  type LessonAccount,
  type LessonAccountMutationResult,
  type LessonBatch,
  type LessonBatchListQuery,
  type LessonMovement,
  type LessonMovementListQuery,
  type LessonMovementType,
  type ReverseLessonGrantRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { IdempotencyService } from '../../idempotency/public.js';
import type {
  LessonPackageDirectory,
  LessonPackageVersionSnapshot,
} from '../../lesson-products/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type { OutboxPort } from '../../outbox/public.js';
import type { StudentDirectory } from '../../people/public.js';
import { lessonBatchStatusAfterDebit } from '../domain/model.js';
import {
  LessonAccountsRepository,
  type DebitAllocation,
  type LessonAccountRecord,
  type LessonBatchRecord,
  type LessonMovementAllocationRecord,
  type LessonMovementRecord,
} from '../infrastructure/persistence/lesson-accounts.repository.js';

export interface LessonMutationContext extends AuditContext {
  actorId: string;
}

interface MutationIdentity {
  idempotencyKey: string;
  expectedAccountRevision: number;
}

export interface LessonConsumptionCommand {
  institutionId: string;
  studentId: string;
  units: number;
  reason: string;
  sourceReference: string;
  metadata?: Record<string, unknown>;
}

export interface LessonConsumptionReversalCommand {
  institutionId: string;
  studentId: string;
  movementId: string;
  reason: string;
  sourceReference: string;
  metadata?: Record<string, unknown>;
}

export interface LessonConsumptionLedger {
  consumeInTransaction(
    input: LessonConsumptionCommand,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ): Promise<LessonAccountMutationResult>;
  reverseConsumptionInTransaction(
    input: LessonConsumptionReversalCommand,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ): Promise<LessonAccountMutationResult>;
}

export class LessonAccountsService implements LessonConsumptionLedger {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: LessonAccountsRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly students: StudentDirectory,
    private readonly packages: LessonPackageDirectory,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxPort,
  ) {}

  async get(
    institutionId: string,
    studentId: string,
    scope: EducationDataScope,
  ): Promise<LessonAccount | null> {
    await this.students.assertStudentAccess(studentId, scope, this.database.db);
    await this.assertParties(institutionId, studentId, this.database.db);
    const account = await this.repository.findAccount(institutionId, studentId);
    return account ? this.accountView(account) : null;
  }

  async listBatches(
    institutionId: string,
    studentId: string,
    input: LessonBatchListQuery,
    scope: EducationDataScope,
  ) {
    await this.students.assertStudentAccess(studentId, scope, this.database.db);
    await this.assertParties(institutionId, studentId, this.database.db);
    const result = await this.repository.listBatches(institutionId, studentId, input);
    return {
      items: result.items.map((batch) => this.batchView(batch)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async listMovements(
    institutionId: string,
    studentId: string,
    input: LessonMovementListQuery,
    scope: EducationDataScope,
  ) {
    await this.students.assertStudentAccess(studentId, scope, this.database.db);
    await this.assertParties(institutionId, studentId, this.database.db);
    const result = await this.repository.listMovements(institutionId, studentId, input);
    return {
      items: result.items.map((movement) =>
        this.movementView(
          movement,
          result.allocations.filter((allocation) => allocation.movementId === movement.id),
        ),
      ),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async grant(
    institutionId: string,
    studentId: string,
    input: GrantLessonUnitsRequest,
    scope: EducationDataScope,
    identity: MutationIdentity,
    context: LessonMutationContext,
  ) {
    this.assertWriteScope(scope);
    return this.executeMutation(
      'lesson-account.grant',
      grantLessonUnitsResultSchema,
      institutionId,
      studentId,
      input,
      identity,
      context,
      async (transaction, account) => {
        const packageVersion = input.templateId
          ? await this.packages.getActiveVersion(institutionId, input.templateId, transaction)
          : null;
        const baseUnits = packageVersion?.baseUnits ?? input.baseUnits!;
        const bonusUnits = packageVersion?.bonusUnits ?? input.bonusUnits ?? 0;
        return this.credit(
          account,
          {
            movementType: 'grant',
            sourceType: input.source,
            sourceReference: input.sourceReference ?? null,
            reason: input.reason,
            baseUnits,
            bonusUnits,
            packageVersion,
          },
          context,
          transaction,
        );
      },
    );
  }

  async adjust(
    institutionId: string,
    studentId: string,
    input: AdjustLessonUnitsRequest,
    scope: EducationDataScope,
    identity: MutationIdentity,
    context: LessonMutationContext,
  ) {
    this.assertWriteScope(scope);
    return this.executeMutation(
      'lesson-account.adjust',
      adjustLessonUnitsResultSchema,
      institutionId,
      studentId,
      input,
      identity,
      context,
      async (transaction, account) => {
        if (input.direction === 'credit') {
          return this.credit(
            account,
            {
              movementType: 'adjustment_credit',
              sourceType: 'adjustment',
              sourceReference: input.sourceReference ?? null,
              reason: input.reason,
              baseUnits: input.units,
              bonusUnits: 0,
              packageVersion: null,
            },
            context,
            transaction,
          );
        }
        return this.debitOldest(
          account,
          input.units,
          'adjustment_debit',
          input.reason,
          input.sourceReference ?? null,
          context,
          transaction,
        );
      },
    );
  }

  async clawback(
    institutionId: string,
    studentId: string,
    batchId: string,
    input: ClawbackLessonUnitsRequest,
    scope: EducationDataScope,
    identity: MutationIdentity,
    context: LessonMutationContext,
  ) {
    this.assertWriteScope(scope);
    return this.executeMutation(
      'lesson-account.clawback',
      clawbackLessonUnitsResultSchema,
      institutionId,
      studentId,
      { ...input, batchId },
      identity,
      context,
      (transaction, account) =>
        this.debitBatch(
          account,
          batchId,
          input.units,
          'clawback',
          input.reason,
          context,
          transaction,
        ),
    );
  }

  async reverseGrant(
    institutionId: string,
    studentId: string,
    batchId: string,
    input: ReverseLessonGrantRequest,
    scope: EducationDataScope,
    identity: MutationIdentity,
    context: LessonMutationContext,
  ) {
    this.assertWriteScope(scope);
    return this.executeMutation(
      'lesson-account.reverse-grant',
      reverseLessonGrantResultSchema,
      institutionId,
      studentId,
      { ...input, batchId },
      identity,
      context,
      async (transaction, account) => {
        const batch = await this.repository.findBatchForUpdate(account.id, batchId, transaction);
        if (!batch) throw new ApiError(404, 'LESSON_BATCH_NOT_FOUND', '课时批次不存在');
        if (
          batch.status !== 'available' ||
          batch.consumedUnits !== 0 ||
          batch.withdrawnUnits !== 0 ||
          batch.remainingUnits !== batch.totalUnits
        ) {
          throw new ApiError(
            409,
            'LESSON_GRANT_ALREADY_USED',
            '该发放已经发生消费或扣回，不能整笔撤销',
          );
        }
        return this.debitLockedBatch(
          account,
          batch,
          batch.totalUnits,
          'grant_reversal',
          input.reason,
          context,
          transaction,
          'reversed',
        );
      },
    );
  }

  async assertReconciled(institutionId: string, studentId: string): Promise<void> {
    const account = await this.repository.findAccount(institutionId, studentId);
    if (!account) return;
    const totals = await this.repository.sumMovements(account.id);
    if (
      totals.credited !== account.lifetimeCreditedUnits ||
      totals.debited !== account.lifetimeDebitedUnits ||
      totals.credited - totals.debited !== account.balanceUnits
    ) {
      throw new ApiError(409, 'LESSON_ACCOUNT_RECONCILIATION_FAILED', '课时账户与流水不一致');
    }
  }

  async consumeInTransaction(
    input: LessonConsumptionCommand,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ): Promise<LessonAccountMutationResult> {
    await this.assertParties(input.institutionId, input.studentId, transaction);
    const { record: account } = await this.repository.lockOrCreateAccount(
      input.institutionId,
      input.studentId,
      transaction,
    );
    return this.debitOldest(
      account,
      input.units,
      'consume',
      input.reason,
      input.sourceReference,
      context,
      transaction,
      input.metadata,
    );
  }

  async reverseConsumptionInTransaction(
    input: LessonConsumptionReversalCommand,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ): Promise<LessonAccountMutationResult> {
    await this.assertParties(input.institutionId, input.studentId, transaction);
    const { record: account } = await this.repository.lockOrCreateAccount(
      input.institutionId,
      input.studentId,
      transaction,
    );
    const original = await this.repository.findMovementForUpdate(
      account.id,
      input.movementId,
      transaction,
    );
    if (!original || original.type !== 'consume' || original.direction !== 'debit') {
      throw new ApiError(404, 'LESSON_CONSUMPTION_NOT_FOUND', '原消课流水不存在');
    }
    const existing = await this.repository.findMovementByRelatedId(original.id, transaction);
    if (existing) throw new ApiError(409, 'LESSON_CONSUMPTION_ALREADY_REVERSED', '该消课已撤销');
    const allocations = await this.repository.listMovementAllocations(original.id, transaction);
    if (allocations.length === 0) {
      throw new ApiError(409, 'LESSON_CONSUMPTION_ALLOCATION_MISSING', '原消课缺少批次分摊');
    }
    const restoredBatches: LessonBatchRecord[] = [];
    for (const allocation of allocations) {
      const batch = await this.repository.findBatchForUpdate(
        account.id,
        allocation.batchId,
        transaction,
      );
      if (!batch) throw new ApiError(409, 'LESSON_BATCH_NOT_FOUND', '原消课批次不存在');
      const restored = await this.repository.restoreConsumedBatch(
        batch,
        allocation.units,
        transaction,
      );
      if (!restored) this.versionConflict();
      restoredBatches.push(restored!);
    }
    const updatedAccount = await this.repository.updateAccount(
      account,
      'credit',
      original.units,
      transaction,
    );
    if (!updatedAccount) this.versionConflict();
    const movement = await this.repository.insertMovement(
      {
        id: randomUUID(),
        accountId: account.id,
        institutionId: account.institutionId,
        studentId: account.studentId,
        sequence: account.lastSequence + 1,
        type: 'consume_reversal',
        direction: 'credit',
        units: original.units,
        balanceBeforeUnits: account.balanceUnits,
        balanceAfterUnits: account.balanceUnits + original.units,
        reason: input.reason,
        sourceReference: input.sourceReference,
        relatedMovementId: original.id,
        actorId: context.actorId,
        metadata: input.metadata ?? {},
      },
      transaction,
    );
    await this.recordMutationAudit('consume_reversal', movement, context, transaction);
    return this.mutationView(updatedAccount!, movement, [], restoredBatches, transaction);
  }

  private async executeMutation<TInput, TResult>(
    operation: string,
    resultSchema: Parameters<IdempotencyService['execute']>[0]['resultSchema'],
    institutionId: string,
    studentId: string,
    input: TInput,
    identity: MutationIdentity,
    context: LessonMutationContext,
    work: (
      transaction: DatabaseTransaction,
      account: LessonAccountRecord,
    ) => Promise<LessonAccountMutationResult>,
  ): Promise<TResult> {
    const result = await this.idempotency.execute(
      { operation, resultSchema },
      {
        scope: `lesson-account:${institutionId}:${studentId}`,
        key: identity.idempotencyKey,
        request: {
          institutionId,
          studentId,
          expectedAccountRevision: identity.expectedAccountRevision,
          input,
        },
        actorId: context.actorId,
      },
      async (transaction) => {
        await this.assertParties(institutionId, studentId, transaction);
        const locked = await this.repository.lockOrCreateAccount(
          institutionId,
          studentId,
          transaction,
        );
        const expected = locked.created ? 0 : locked.record.revision;
        if (identity.expectedAccountRevision !== expected) {
          throw new ApiError(
            409,
            'LESSON_ACCOUNT_VERSION_CONFLICT',
            '课时账户已被其他操作更新，请刷新后重试',
            { expectedRevision: identity.expectedAccountRevision, actualRevision: expected },
          );
        }
        return work(transaction, locked.record);
      },
    );
    return result.value as TResult;
  }

  private async credit(
    account: LessonAccountRecord,
    input: {
      movementType: 'grant' | 'adjustment_credit';
      sourceType: LessonBatchRecord['sourceType'];
      sourceReference: string | null;
      reason: string;
      baseUnits: number;
      bonusUnits: number;
      packageVersion: LessonPackageVersionSnapshot | null;
    },
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ): Promise<LessonAccountMutationResult> {
    const units = input.baseUnits + input.bonusUnits;
    const movementId = randomUUID();
    try {
      const updatedAccount = await this.repository.updateAccount(
        account,
        'credit',
        units,
        transaction,
      );
      if (!updatedAccount) this.versionConflict();
      const movement = await this.repository.insertMovement(
        {
          id: movementId,
          accountId: account.id,
          institutionId: account.institutionId,
          studentId: account.studentId,
          sequence: account.lastSequence + 1,
          type: input.movementType,
          direction: 'credit',
          units,
          balanceBeforeUnits: account.balanceUnits,
          balanceAfterUnits: account.balanceUnits + units,
          reason: input.reason,
          sourceReference: input.sourceReference,
          actorId: context.actorId,
          metadata: input.packageVersion
            ? {
                packageId: input.packageVersion.packageId,
                packageVersion: input.packageVersion.version,
              }
            : {},
        },
        transaction,
      );
      const batch = await this.repository.createBatch(
        {
          accountId: account.id,
          institutionId: account.institutionId,
          studentId: account.studentId,
          originMovementId: movementId,
          templateId: input.packageVersion?.packageId ?? null,
          templateVersionId: input.packageVersion?.id ?? null,
          templateRevision: input.packageVersion?.version ?? null,
          templateName: input.packageVersion?.name ?? null,
          sourceType: input.sourceType,
          sourceReference: input.sourceReference,
          sourceMetadata: {},
          reason: input.reason,
          baseUnits: input.baseUnits,
          bonusUnits: input.bonusUnits,
          totalUnits: units,
          remainingUnits: units,
        },
        transaction,
      );
      await this.recordMutationAudit(input.movementType, movement, context, transaction);
      return this.mutationView(updatedAccount!, movement, [], [batch], transaction);
    } catch (error) {
      if (this.repository.isSourceIdentityViolation(error)) {
        throw new ApiError(409, 'LESSON_GRANT_SOURCE_EXISTS', '相同来源编号已经发放过课时');
      }
      throw error;
    }
  }

  private async debitOldest(
    account: LessonAccountRecord,
    units: number,
    type: 'adjustment_debit' | 'consume',
    reason: string,
    sourceReference: string | null,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
    metadata: Record<string, unknown> = {},
  ): Promise<LessonAccountMutationResult> {
    if (account.balanceUnits < units) this.insufficientBalance();
    const batches = await this.repository.lockAvailableBatches(account.id, transaction);
    let outstanding = units;
    const allocations: DebitAllocation[] = [];
    for (const batch of batches) {
      if (outstanding === 0) break;
      const allocated = Math.min(outstanding, batch.remainingUnits);
      if (allocated > 0) allocations.push({ batch, units: allocated });
      outstanding -= allocated;
    }
    if (outstanding !== 0) {
      throw new ApiError(409, 'LESSON_BATCH_BALANCE_MISMATCH', '可用批次与账户余额不一致');
    }
    return this.applyDebit(
      account,
      allocations,
      type,
      reason,
      sourceReference,
      context,
      transaction,
      undefined,
      metadata,
    );
  }

  private async debitBatch(
    account: LessonAccountRecord,
    batchId: string,
    units: number,
    type: 'clawback',
    reason: string,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ) {
    const batch = await this.repository.findBatchForUpdate(account.id, batchId, transaction);
    if (!batch) throw new ApiError(404, 'LESSON_BATCH_NOT_FOUND', '课时批次不存在');
    if (batch.status !== 'available' || batch.remainingUnits < units) {
      throw new ApiError(409, 'LESSON_BATCH_INSUFFICIENT', '该批次剩余课时不足');
    }
    return this.debitLockedBatch(
      account,
      batch,
      units,
      type,
      reason,
      context,
      transaction,
      batch.remainingUnits === units ? 'depleted' : 'available',
    );
  }

  private debitLockedBatch(
    account: LessonAccountRecord,
    batch: LessonBatchRecord,
    units: number,
    type: 'clawback' | 'grant_reversal',
    reason: string,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
    status: LessonBatchRecord['status'],
  ) {
    return this.applyDebit(
      account,
      [{ batch, units }],
      type,
      reason,
      batch.sourceReference,
      context,
      transaction,
      status,
    );
  }

  private async applyDebit(
    account: LessonAccountRecord,
    allocations: DebitAllocation[],
    type: 'adjustment_debit' | 'clawback' | 'grant_reversal' | 'consume',
    reason: string,
    sourceReference: string | null,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
    forcedStatus?: LessonBatchRecord['status'],
    metadata: Record<string, unknown> = {},
  ): Promise<LessonAccountMutationResult> {
    const units = allocations.reduce((sum, allocation) => sum + allocation.units, 0);
    if (account.balanceUnits < units) this.insufficientBalance();
    const movementId = randomUUID();
    const affectedBatches: LessonBatchRecord[] = [];
    const allocationRows: LessonMovementAllocationRecord[] = [];
    for (const allocation of allocations) {
      const remainingUnits = allocation.batch.remainingUnits - allocation.units;
      const updated =
        type === 'consume'
          ? await this.repository.consumeFromBatch(
              allocation.batch,
              allocation.units,
              lessonBatchStatusAfterDebit(remainingUnits),
              transaction,
            )
          : await this.repository.withdrawFromBatch(
              allocation.batch,
              allocation.units,
              forcedStatus ?? lessonBatchStatusAfterDebit(remainingUnits),
              transaction,
            );
      if (!updated) this.versionConflict();
      affectedBatches.push(updated!);
      allocationRows.push({
        movementId,
        batchId: allocation.batch.id,
        units: allocation.units,
        batchBalanceBeforeUnits: allocation.batch.remainingUnits,
        batchBalanceAfterUnits: remainingUnits,
        createdAt: new Date(),
      });
    }
    const updatedAccount = await this.repository.updateAccount(
      account,
      'debit',
      units,
      transaction,
    );
    if (!updatedAccount) this.versionConflict();
    const movement = await this.repository.insertMovement(
      {
        id: movementId,
        accountId: account.id,
        institutionId: account.institutionId,
        studentId: account.studentId,
        sequence: account.lastSequence + 1,
        type,
        direction: 'debit',
        units,
        balanceBeforeUnits: account.balanceUnits,
        balanceAfterUnits: account.balanceUnits - units,
        reason,
        sourceReference,
        actorId: context.actorId,
        metadata,
      },
      transaction,
    );
    await this.repository.insertAllocations(allocationRows, transaction);
    await this.recordMutationAudit(type, movement, context, transaction);
    return this.mutationView(
      updatedAccount!,
      movement,
      allocationRows,
      affectedBatches,
      transaction,
    );
  }

  private async recordMutationAudit(
    type: LessonMovementType,
    movement: LessonMovementRecord,
    context: LessonMutationContext,
    transaction: DatabaseTransaction,
  ) {
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: `lesson-account.${type}`,
        resourceType: 'lesson.movement',
        resourceId: movement.id,
        changes: [
          {
            field: 'balanceUnits',
            before: movement.balanceBeforeUnits,
            after: movement.balanceAfterUnits,
          },
        ],
        metadata: {
          institutionId: movement.institutionId,
          studentId: movement.studentId,
          units: movement.units,
          direction: movement.direction,
        },
      },
      transaction,
    );
    await this.outbox.append(
      {
        topic: 'education.lesson-account.changed',
        aggregate: {
          type: 'lesson-account',
          id: movement.accountId,
          version: movement.sequence,
        },
        deduplicationKey: `lesson-movement:${movement.id}`,
        occurredAt: movement.occurredAt,
        payload: {
          accountId: movement.accountId,
          institutionId: movement.institutionId,
          studentId: movement.studentId,
          movementId: movement.id,
          sequence: movement.sequence,
          type: movement.type,
          direction: movement.direction,
          units: movement.units,
          balanceAfterUnits: movement.balanceAfterUnits,
        },
      },
      transaction,
    );
  }

  private async assertParties(
    institutionId: string,
    studentId: string,
    transaction: Parameters<InstitutionDirectory['assertActiveInstitution']>[1],
  ) {
    await this.institutions.assertActiveInstitution(institutionId, transaction);
    await this.students.assertActiveStudentInstitution(studentId, institutionId, transaction);
  }

  private async accountView(
    record: LessonAccountRecord,
    executor: DatabaseTransaction | undefined = undefined,
  ): Promise<LessonAccount> {
    return {
      id: record.id,
      studentId: record.studentId,
      institutionId: record.institutionId,
      balanceUnits: record.balanceUnits,
      lifetimeCreditedUnits: record.lifetimeCreditedUnits,
      lifetimeDebitedUnits: record.lifetimeDebitedUnits,
      activeBatchCount: await this.repository.activeBatchCount(record.id, executor),
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private batchView(record: LessonBatchRecord): LessonBatch {
    return {
      id: record.id,
      accountId: record.accountId,
      studentId: record.studentId,
      institutionId: record.institutionId,
      originMovementId: record.originMovementId,
      templateId: record.templateId,
      templateRevision: record.templateRevision,
      templateName: record.templateName,
      sourceType: record.sourceType,
      sourceReference: record.sourceReference,
      reason: record.reason,
      baseUnits: record.baseUnits,
      bonusUnits: record.bonusUnits,
      totalUnits: record.totalUnits,
      consumedUnits: record.consumedUnits,
      withdrawnUnits: record.withdrawnUnits,
      remainingUnits: record.remainingUnits,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private movementView(
    record: LessonMovementRecord,
    allocations: LessonMovementAllocationRecord[],
  ): LessonMovement {
    return {
      id: record.id,
      accountId: record.accountId,
      studentId: record.studentId,
      institutionId: record.institutionId,
      type: record.type,
      direction: record.direction,
      units: record.units,
      balanceBeforeUnits: record.balanceBeforeUnits,
      balanceAfterUnits: record.balanceAfterUnits,
      reason: record.reason,
      sourceReference: record.sourceReference,
      allocations: allocations.map((allocation) => ({
        batchId: allocation.batchId,
        units: allocation.units,
      })),
      actorId: record.actorId,
      occurredAt: record.occurredAt.toISOString(),
    };
  }

  private async mutationView(
    account: LessonAccountRecord,
    movement: LessonMovementRecord,
    allocations: LessonMovementAllocationRecord[],
    batches: LessonBatchRecord[],
    transaction: DatabaseTransaction,
  ): Promise<LessonAccountMutationResult> {
    return {
      account: await this.accountView(account, transaction),
      movement: this.movementView(movement, allocations),
      affectedBatches: batches.map((batch) => this.batchView(batch)),
    };
  }

  private insufficientBalance(): never {
    throw new ApiError(409, 'LESSON_BALANCE_INSUFFICIENT', '课时余额不足');
  }

  private assertWriteScope(
    scope: EducationDataScope,
  ): asserts scope is Extract<EducationDataScope, { kind: 'institution' }> {
    if (scope.kind !== 'institution') {
      throw new ApiError(403, 'LESSON_ACCOUNT_WRITE_SCOPE_DENIED', '当前数据范围不能变更课时');
    }
  }

  private versionConflict(): never {
    throw new ApiError(409, 'LESSON_ACCOUNT_VERSION_CONFLICT', '课时账户已被其他操作更新');
  }
}
