import { createHash, randomBytes } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  lessonOrderSchema,
  type CreateOfflineLessonOrderRequest,
  type CreateLessonOrderRequest,
  type LessonOrder,
  type LessonOrderListQuery,
  type LessonReceipt,
  type MiniStudentListQuery,
  type RecordGroupOrderOfflineSettlementRequest,
  type RefundLessonOrderRequest,
  type PaymentIntentDetail,
  type PaymentProvider,
  type StartGroupOrderOnlinePaymentRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { IdempotencyService } from '../../idempotency/public.js';
import type { LessonPurchaseGrantLedger } from '../../lesson-accounts/public.js';
import type { LessonPackageDirectory } from '../../lesson-products/public.js';
import type { PaymentFact, PaymentFactReceiver } from '../../payments/public.js';
import type {
  PeriodCardEntitlementIssuer,
  PeriodCardProductDirectory,
} from '../../period-cards/public.js';
import type { SettingsReader } from '../../settings/public.js';
import type {
  LessonCommerceInstitutionDirectory,
  LessonCommercePeopleDirectory,
  LessonCommercePayments,
  GroupFormationOrderIssuer,
  WechatMiniPayerDirectory,
} from '../domain/model.js';
import {
  LessonCommerceRepository,
  type LessonCommerceOrderRecord,
} from '../infrastructure/persistence/lesson-commerce.repository.js';

type ActorContext = AuditContext & { actorId: string };

export class LessonCommerceService implements PaymentFactReceiver, GroupFormationOrderIssuer {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: LessonCommerceRepository,
    private readonly institutions: LessonCommerceInstitutionDirectory,
    private readonly people: LessonCommercePeopleDirectory,
    private readonly products: LessonPackageDirectory,
    private readonly periodCardProducts: PeriodCardProductDirectory,
    private readonly periodCardEntitlements: PeriodCardEntitlementIssuer,
    private readonly lessons: LessonPurchaseGrantLedger,
    private readonly payments: LessonCommercePayments,
    private readonly payers: WechatMiniPayerDirectory,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
    private readonly settings: SettingsReader,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  listStudents(identityUserId: string, input: MiniStudentListQuery) {
    return this.people.listStudentsForGuardian(identityUserId, input.institutionId, input);
  }

  listInstitutions() {
    return this.institutions.list({ page: 1, pageSize: 100, status: 'active' }, null);
  }

  async listPackages(institutionId: string) {
    if (!(await this.onlineSalesEnabled())) return [];
    return this.products.listPurchasable(institutionId, this.clock());
  }

  async listPeriodCards(institutionId: string) {
    if (!(await this.onlineSalesEnabled())) return [];
    return this.periodCardProducts.listPurchasable(institutionId, this.clock());
  }

  onboardStudent(
    identityUserId: string,
    input: {
      institutionId: string;
      guardianName: string;
      relationship: string;
      student: Parameters<LessonCommercePeopleDirectory['onboardStudentForGuardian']>[2];
    },
    context: AuditContext,
  ) {
    return this.people.onboardStudentForGuardian(
      identityUserId,
      input.institutionId,
      input.student,
      { fullName: input.guardianName, relationship: input.relationship },
      context,
    );
  }

  async createCheckout(
    identityUserId: string,
    input: CreateLessonOrderRequest,
    idempotencyKey: string,
    context: ActorContext,
  ): Promise<{ order: LessonOrder; payment: PaymentIntentDetail }> {
    await this.assertOnlineSalesEnabled();
    const provider = input.provider ?? 'mock';
    const claimed = await this.idempotency.execute(
      { operation: 'lesson-commerce.create-order', resultSchema: lessonOrderSchema },
      {
        scope: `guardian-orders:${identityUserId}`,
        key: idempotencyKey,
        request: { ...input, provider },
        actorId: identityUserId,
      },
      async (transaction) => {
        const owner = await this.people.assertGuardianStudent(
          identityUserId,
          input.institutionId,
          input.studentId,
          transaction,
        );
        const order =
          input.productType === 'period_card'
            ? await this.createOnlinePeriodCardOrder(
                input,
                owner,
                identityUserId,
                provider,
                transaction,
              )
            : await this.createOnlineLessonPackageOrder(
                input,
                owner,
                identityUserId,
                provider,
                transaction,
              );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-order.created',
            resourceType: 'lesson.order',
            resourceId: order.id,
            changes: [
              { field: 'status', before: null, after: order.status },
              { field: 'amountMinor', before: null, after: order.amountMinor },
            ],
            metadata: {
              orderNo: order.orderNo,
              institutionId: order.institutionId,
              studentId: order.studentId,
              productType: order.productType,
              productId: order.packageId ?? order.periodCardProductId,
              productVersion: order.packageVersion ?? order.periodCardProductVersion,
              currency: order.currency,
            },
          },
          transaction,
        );
        return this.view(order);
      },
    );

    let order = await this.requireOrder(claimed.value.id);
    await this.assertGuardianOwned(order, identityUserId);
    if (
      order.status === 'pending_payment' &&
      order.expiresAt &&
      order.expiresAt.getTime() <= this.clock().getTime()
    ) {
      const paymentIntentId = order.paymentIntentId;
      if (paymentIntentId) {
        const payment = await this.payments.reconcile(paymentIntentId, context);
        order = await this.requireOrder(order.id);
        if (payment.status === 'pending' && order.status === 'pending_payment') {
          await this.payments.close(paymentIntentId, context);
          order = await this.requireOrder(order.id);
        }
      } else {
        await this.closeExpiredWithoutPayment(order, context);
        order = await this.requireOrder(order.id);
      }
      if (order.status === 'pending_payment') {
        throw new ApiError(
          409,
          'LESSON_ORDER_PAYMENT_UNCERTAIN',
          '订单支付状态暂时无法确认，请稍后查询或联系管理员',
        );
      }
      if (order.status === 'closed') {
        throw new ApiError(409, 'LESSON_ORDER_EXPIRED', '订单已过期，请重新下单');
      }
    }
    if (order.status !== 'pending_payment') {
      throw new ApiError(409, 'LESSON_ORDER_NOT_PAYABLE', '订单当前状态不能继续支付');
    }
    const payment = await this.ensurePaymentIntent(order, provider, context);
    return { order: this.view(await this.requireOrder(order.id)), payment };
  }

  async createOfflineOrder(
    institutionId: string,
    input: CreateOfflineLessonOrderRequest,
    idempotencyKey: string,
    context: ActorContext,
  ): Promise<LessonOrder> {
    const claimed = await this.idempotency.execute(
      { operation: 'lesson-commerce.create-offline-order', resultSchema: lessonOrderSchema },
      {
        scope: `institution-orders:${institutionId}`,
        key: idempotencyKey,
        request: input,
        actorId: context.actorId,
      },
      async (transaction) => {
        await this.institutions.assertActiveInstitution(institutionId, transaction);
        let student: { id: string; fullName: string };
        let guardian: { id: string; fullName: string };
        if (input.student.kind === 'new') {
          const onboarded = await this.people.onboardStudentInTransaction(
            institutionId,
            {
              fullName: input.student.profile.fullName,
              preferredName: input.student.profile.preferredName ?? null,
              grade: input.student.profile.grade ?? null,
              school: input.student.profile.school ?? null,
              gender: input.student.profile.gender ?? 'unknown',
              birthDate: input.student.profile.birthDate ?? null,
              notes: input.student.profile.notes ?? null,
            },
            {
              fullName: input.student.guardian.fullName,
              phone: input.student.guardian.phone ?? null,
              email: input.student.guardian.email ?? null,
              identityUserId: input.student.guardian.identityUserId ?? null,
              notes: input.student.guardian.notes ?? null,
              relationship: input.student.guardian.relationship,
              isPrimary: true,
            },
            context,
            transaction,
          );
          student = onboarded.student;
          guardian = onboarded.guardian.guardian;
        } else {
          const existing = await this.people.getStudentGuardianSnapshot(
            institutionId,
            input.student.studentId,
            input.student.guardianId,
            transaction,
          );
          student = existing.student;
          guardian = existing.guardian;
        }
        const now = this.clock();
        const order =
          input.productType === 'period_card'
            ? await this.createOfflinePeriodCardOrder(
                institutionId,
                input,
                student,
                guardian,
                context.actorId,
                transaction,
              )
            : await this.createOfflineLessonPackageOrder(
                institutionId,
                input,
                student,
                guardian,
                context.actorId,
                transaction,
              );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-order.offline-payment-recorded',
            resourceType: 'lesson.order',
            resourceId: order.id,
            changes: [
              { field: 'status', before: null, after: order.status },
              { field: 'amountMinor', before: null, after: order.amountMinor },
            ],
            metadata: {
              orderNo: order.orderNo,
              institutionId,
              studentId: order.studentId,
              productType: order.productType,
              productVersion: order.packageVersion ?? order.periodCardProductVersion,
              paymentMethod: order.paymentMethod,
              recordedAt: now.toISOString(),
            },
          },
          transaction,
        );
        return this.view(order);
      },
    );

    let order = await this.requireOrder(claimed.value.id);
    if (order.status === 'paid_pending_grant' || order.status === 'grant_failed') {
      try {
        await this.grant(order, context);
      } catch {
        // The paid fact and failure are durable. Return the order so the operator sees
        // the recoverable state instead of attempting another sale.
      }
      order = await this.requireOrder(order.id);
    }
    return this.view(order);
  }

  async ensureGroupFormationOrders(
    input: Parameters<GroupFormationOrderIssuer['ensureGroupFormationOrders']>[0],
    context: ActorContext,
  ): Promise<LessonOrder[]> {
    if (input.members.length === 0) return [];
    let created: LessonCommerceOrderRecord[];
    try {
      created = await this.database.transaction(async (transaction) => {
        await this.institutions.assertActiveInstitution(input.institutionId, transaction);
        const product = await this.products.getVersion(
          input.institutionId,
          input.packageId,
          input.packageVersion,
          transaction,
        );
        if (
          product.originType !== 'group_formation' ||
          product.originId !== input.formationId ||
          product.saleScope !== 'internal'
        ) {
          throw new ApiError(
            409,
            'GROUP_FORMATION_PACKAGE_SOURCE_MISMATCH',
            '拼课成班课时包来源不一致',
          );
        }

        const orders: LessonCommerceOrderRecord[] = [];
        for (const member of input.members) {
          if (
            member.totalAmountMinor !== member.depositAppliedMinor + member.balanceDueMinor ||
            member.totalAmountMinor !== product.priceAmount
          ) {
            throw new ApiError(
              409,
              'GROUP_FORMATION_SETTLEMENT_AMOUNT_MISMATCH',
              '拼课订单金额与成班价格快照不一致',
            );
          }
          const existing = await this.repository.findGroupFormationStudent(
            input.formationId,
            member.studentId,
            transaction,
          );
          if (existing) {
            this.assertGroupOrderDefinition(existing, input, member);
            orders.push(existing);
            continue;
          }
          const balanceSettled = member.balanceDueMinor === 0;
          const order = await this.repository.create(
            {
              orderNo: this.orderNo(),
              institutionId: input.institutionId,
              studentId: member.studentId,
              studentName: member.studentName,
              guardianId: member.guardianId,
              guardianName: member.guardianName,
              createdByUserId: context.actorId,
              sourceType: 'group_formation',
              sourceReferenceId: input.formationId,
              productType: 'lesson_package',
              packageId: product.packageId,
              packageVersionId: product.id,
              packageVersion: product.version,
              packageName: product.name,
              baseUnits: product.baseUnits,
              bonusUnits: product.bonusUnits,
              channel: balanceSettled ? 'offline' : 'pending',
              listedAmountMinor: member.totalAmountMinor,
              amountMinor: member.totalAmountMinor,
              depositAppliedMinor: member.depositAppliedMinor,
              balanceDueMinor: member.balanceDueMinor,
              currency: product.currency,
              provider: null,
              paymentMethod: balanceSettled ? member.depositPaymentMethod : 'pending',
              paymentReference: null,
              paymentNote: balanceSettled ? '拼课意向金已全额抵扣，无需补尾款' : null,
              priceAdjustmentReason: null,
              receiptNo: this.receiptNo(),
              status: balanceSettled ? 'paid_pending_grant' : 'awaiting_settlement',
              paidAt: balanceSettled ? this.clock() : null,
              expiresAt: null,
              paymentDeadlineAt: input.paymentDeadlineAt,
            },
            transaction,
          );
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'lesson-order.group-formation-created',
              resourceType: 'lesson.order',
              resourceId: order.id,
              changes: [{ field: 'status', before: null, after: order.status }],
              metadata: {
                orderNo: order.orderNo,
                formationId: input.formationId,
                studentId: member.studentId,
                amountMinor: member.totalAmountMinor,
                depositAppliedMinor: member.depositAppliedMinor,
                balanceDueMinor: member.balanceDueMinor,
              },
            },
            transaction,
          );
          orders.push(order);
        }
        return orders;
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      created = await this.repository.listGroupFormationOrders(input.formationId);
      if (created.length !== input.members.length) {
        throw new ApiError(
          409,
          'GROUP_FORMATION_ORDER_CONCURRENT_CREATION',
          '拼课订单正在并发创建，请稍后重试',
        );
      }
      for (const member of input.members) {
        const order = created.find((item) => item.studentId === member.studentId);
        if (!order) {
          throw new ApiError(409, 'GROUP_FORMATION_ORDER_MISSING', '成班学员订单创建不完整');
        }
        this.assertGroupOrderDefinition(order, input, member);
      }
    }

    for (const order of created) {
      if (order.status === 'paid_pending_grant' || order.status === 'grant_failed') {
        try {
          await this.grant(order, context);
        } catch {
          // A durable grant_failed state is visible to operators and can be retried.
        }
      }
    }
    return this.listGroupFormationOrders(input.formationId);
  }

  async listGroupFormationOrders(formationId: string): Promise<LessonOrder[]> {
    const records = await this.repository.listGroupFormationOrders(formationId);
    return records.map((record) => this.view(record));
  }

  async recordGroupOfflineSettlement(
    institutionId: string,
    orderId: string,
    input: RecordGroupOrderOfflineSettlementRequest,
    context: ActorContext,
  ): Promise<LessonOrder> {
    let order = await this.requireGroupOrder(institutionId, orderId);
    if (order.status === 'completed') return this.view(order);
    if (order.status !== 'awaiting_settlement') {
      throw new ApiError(409, 'GROUP_ORDER_NOT_AWAITING_SETTLEMENT', '该拼课订单当前不能登记尾款');
    }
    if (input.paidAmountMinor !== order.balanceDueMinor) {
      throw new ApiError(
        400,
        'GROUP_ORDER_BALANCE_AMOUNT_MISMATCH',
        '实收尾款必须等于订单待付尾款',
      );
    }
    const paidAt = input.paidAt ? new Date(input.paidAt) : this.clock();
    const recordedLate = Boolean(
      order.paymentDeadlineAt && paidAt.getTime() > order.paymentDeadlineAt.getTime(),
    );
    order = await this.database.transaction(async (transaction) => {
      const updated = await this.repository.recordOfflineSettlement(
        order.id,
        input.expectedRevision,
        {
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paymentNote: input.paymentNote,
          paidAt,
        },
        transaction,
      );
      if (!updated) {
        throw new ApiError(409, 'LESSON_ORDER_VERSION_CONFLICT', '订单已变化，请刷新后重试');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-order.group-balance-offline-recorded',
          resourceType: 'lesson.order',
          resourceId: updated.id,
          changes: [{ field: 'status', before: order.status, after: updated.status }],
          metadata: {
            orderNo: updated.orderNo,
            formationId: updated.sourceReferenceId,
            balanceDueMinor: updated.balanceDueMinor,
            paymentMethod: updated.paymentMethod,
            recordedLate,
          },
        },
        transaction,
      );
      return updated;
    });
    try {
      await this.grant(order, context);
    } catch {
      // Payment remains durable and the resulting grant_failed state is retryable.
    }
    return this.view(await this.requireOrder(order.id));
  }

  async startGroupOnlinePaymentForGuardian(
    identityUserId: string,
    orderId: string,
    input: StartGroupOrderOnlinePaymentRequest,
    context: ActorContext,
  ): Promise<{ order: LessonOrder; payment: PaymentIntentDetail }> {
    const order = await this.requireOrder(orderId);
    await this.assertGuardianOwned(order, identityUserId);
    return this.startGroupOnlinePayment(order, input.provider ?? 'wechat_pay', context);
  }

  async startGroupOnlinePaymentForInstitution(
    institutionId: string,
    orderId: string,
    input: StartGroupOrderOnlinePaymentRequest,
    context: ActorContext,
  ): Promise<{ order: LessonOrder; payment: PaymentIntentDetail }> {
    const order = await this.requireGroupOrder(institutionId, orderId);
    const provider = input.provider ?? 'mock';
    if (provider === 'wechat_pay') {
      throw new ApiError(
        409,
        'GROUP_ORDER_GUARDIAN_PAYMENT_REQUIRED',
        '微信尾款需由家长在小程序中发起',
      );
    }
    return this.startGroupOnlinePayment(order, provider, context);
  }

  async getForGuardian(identityUserId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    await this.assertGuardianOwned(order, identityUserId);
    return this.view(order);
  }

  async receiptForGuardian(identityUserId: string, orderId: string): Promise<LessonReceipt> {
    const order = await this.requireOrder(orderId);
    await this.assertGuardianOwned(order, identityUserId);
    return this.receipt(order);
  }

  async listForGuardian(identityUserId: string, input: LessonOrderListQuery) {
    const guardian = await this.people.guardianForIdentity(identityUserId);
    const result = await this.repository.listForGuardian(guardian.id, input);
    return this.page(result, input);
  }

  async listForInstitution(institutionId: string, input: LessonOrderListQuery) {
    const result = await this.repository.listForInstitution(institutionId, input);
    return this.page(result, input);
  }

  async receiptForInstitution(institutionId: string, orderId: string): Promise<LessonReceipt> {
    const order = await this.requireOrder(orderId);
    if (order.institutionId !== institutionId) {
      throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
    }
    return this.receipt(order);
  }

  async syncForGuardian(identityUserId: string, orderId: string, context: ActorContext) {
    const order = await this.requireOrder(orderId);
    await this.assertGuardianOwned(order, identityUserId);
    if (!order.paymentIntentId) {
      throw new ApiError(409, 'LESSON_ORDER_PAYMENT_NOT_CREATED', '订单尚未创建支付交易');
    }
    await this.payments.reconcile(order.paymentIntentId, context);
    return this.view(await this.requireOrder(order.id));
  }

  async retryGrant(institutionId: string, orderId: string, context: ActorContext) {
    const order = await this.requireOrder(orderId);
    if (order.institutionId !== institutionId) {
      throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
    }
    if (!['paid_pending_grant', 'grant_failed'].includes(order.status)) {
      if (order.status === 'completed') return this.view(order);
      throw new ApiError(409, 'LESSON_ORDER_GRANT_NOT_RETRYABLE', '订单当前状态不能重试发放');
    }
    await this.grant(order, context);
    return this.view(await this.requireOrder(order.id));
  }

  async refundOrder(
    institutionId: string,
    orderId: string,
    input: RefundLessonOrderRequest,
    context: ActorContext,
  ): Promise<LessonOrder> {
    let order = await this.requireOrder(orderId);
    if (order.institutionId !== institutionId) {
      throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
    }
    if (order.sourceType === 'group_formation') {
      throw new ApiError(
        409,
        'GROUP_ORDER_REFUND_WORKFLOW_REQUIRED',
        '拼课订单包含意向金与尾款，需通过拼课专用退款流程处理',
      );
    }
    if (order.status === 'refunded') return this.view(order);
    if (!['completed', 'refunding'].includes(order.status)) {
      throw new ApiError(409, 'LESSON_ORDER_NOT_REFUNDABLE', '只有已完成订单可以退款');
    }
    let startedRefundNow = false;
    let originalCompletedAt: Date | null = null;
    if (order.status === 'completed') {
      originalCompletedAt = order.completedAt;
      if (!originalCompletedAt) {
        throw new ApiError(409, 'LESSON_ORDER_COMPLETION_MISSING', '订单缺少完成时间');
      }
      order = await this.database.transaction(async (transaction) => {
        const locked = await this.repository.lockById(orderId, transaction);
        if (!locked) throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
        const updated = await this.repository.markRefunding(
          locked.id,
          input.expectedRevision,
          transaction,
        );
        if (!updated) {
          throw new ApiError(409, 'LESSON_ORDER_VERSION_CONFLICT', '订单已变化，请刷新后重试');
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-order.refund-started',
            resourceType: 'lesson.order',
            resourceId: locked.id,
            changes: [{ field: 'status', before: locked.status, after: updated.status }],
            metadata: { orderNo: locked.orderNo, reason: input.reason },
          },
          transaction,
        );
        return updated;
      });
      startedRefundNow = true;
    }

    const refundAttemptKey = `lesson-order-refund:${order.id}:${order.revision}`;
    try {
      if (order.productType === 'lesson_package') {
        if (!order.grantMovementId) {
          throw new ApiError(409, 'LESSON_ORDER_GRANT_MISSING', '订单缺少课时发放记录');
        }
        await this.lessons.refundPurchase(
          {
            institutionId,
            studentId: order.studentId,
            grantMovementId: order.grantMovementId,
            orderNo: order.orderNo,
            operationKey: refundAttemptKey,
            reason: `订单退款回收：${input.reason}`,
          },
          context,
        );
      } else {
        if (!order.periodCardEntitlementId) {
          throw new ApiError(409, 'PERIOD_CARD_ORDER_ENTITLEMENT_MISSING', '订单缺少周期卡权益');
        }
        const entitlement = await this.periodCardEntitlements.getEntitlement(
          institutionId,
          order.periodCardEntitlementId,
        );
        if (entitlement.lifecycleState !== 'revoked') {
          await this.periodCardEntitlements.revoke(
            institutionId,
            entitlement.id,
            {
              operationId: deterministicUuid(refundAttemptKey),
              expectedRevision: entitlement.revision,
              reason: `订单退款撤销：${input.reason}`,
            },
            context,
          );
        }
      }
    } catch (error) {
      if (startedRefundNow && originalCompletedAt) {
        await this.database.transaction(async (transaction) => {
          const restored = await this.repository.restoreCompletedAfterRejectedRefund(
            order.id,
            originalCompletedAt!,
            transaction,
          );
          if (!restored) return;
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'lesson-order.refund-rejected',
              resourceType: 'lesson.order',
              resourceId: restored.id,
              changes: [{ field: 'status', before: 'refunding', after: 'completed' }],
              metadata: {
                orderNo: restored.orderNo,
                reason: input.reason,
                errorCode: error instanceof ApiError ? error.code : 'ENTITLEMENT_RECOVERY_FAILED',
              },
            },
            transaction,
          );
        });
      }
      throw error;
    }

    if (order.channel === 'online') {
      if (!order.paymentIntentId) {
        throw new ApiError(409, 'LESSON_ORDER_PAYMENT_MISSING', '线上订单缺少支付交易');
      }
      const paymentRefund = await this.payments.refundForBusinessWorkflow(
        order.paymentIntentId,
        {
          requestKey: `lesson-order-refund:${order.id}`,
          amountMinor: order.amountMinor,
          reason: `购课订单 ${order.orderNo} 全额退款`,
        },
        context,
      );
      if (paymentRefund.status !== 'succeeded') {
        throw new ApiError(
          409,
          'LESSON_ORDER_REFUND_RECONCILIATION_REQUIRED',
          '退款结果尚未确认，订单保持退款处理中，请对账后重试',
        );
      }
    }

    const refunded = await this.database.transaction(async (transaction) => {
      const updated = await this.repository.markRefunded(order.id, transaction);
      if (!updated) {
        const current = await this.repository.lockById(order.id, transaction);
        if (current?.status === 'refunded') return current;
        throw new ApiError(409, 'LESSON_ORDER_REFUND_STATE_CONFLICT', '订单退款状态更新冲突');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-order.refunded',
          resourceType: 'lesson.order',
          resourceId: updated.id,
          changes: [{ field: 'status', before: 'refunding', after: 'refunded' }],
          metadata: {
            orderNo: updated.orderNo,
            reason: input.reason,
            channel: updated.channel,
            amountMinor: updated.amountMinor,
          },
        },
        transaction,
      );
      return updated;
    });
    return this.view(refunded);
  }

  async assertRefundAllowed(request: { merchantReference: string }): Promise<void> {
    const order = await this.repository.findByOrderNo(
      this.businessOrderNo(request.merchantReference),
    );
    if (order) {
      throw new ApiError(
        409,
        'LESSON_ORDER_REFUND_WORKFLOW_REQUIRED',
        '购课订单必须通过专用退课退款流程处理，不能直接退款',
      );
    }
  }

  async receive(fact: PaymentFact): Promise<void> {
    const order =
      (await this.repository.findByPaymentIntentId(fact.intentId)) ??
      (await this.repository.findByOrderNo(this.businessOrderNo(fact.merchantReference)));
    if (!order) return;
    if (order.paymentIntentId !== fact.intentId) {
      throw new ApiError(409, 'LESSON_ORDER_PAYMENT_IDENTITY_MISMATCH', '订单支付身份不匹配');
    }
    const expectedAmountMinor =
      order.sourceType === 'group_formation' ? order.balanceDueMinor : order.amountMinor;
    if (expectedAmountMinor !== fact.amountMinor || order.currency !== fact.currency) {
      throw new ApiError(409, 'LESSON_ORDER_PAYMENT_AMOUNT_MISMATCH', '订单支付金额或币种不匹配');
    }
    if (fact.status !== 'succeeded') {
      if (fact.status === 'closed' || fact.status === 'failed') {
        await this.closeFromPayment(order, fact);
      }
      return;
    }

    const paid = await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockById(order.id, transaction);
      if (!locked) throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
      if (locked.status === 'completed') return locked;
      if (!['pending_payment', 'paid_pending_grant', 'grant_failed'].includes(locked.status)) {
        throw new ApiError(409, 'LESSON_ORDER_PAYMENT_STATE_CONFLICT', '支付事实与订单状态冲突');
      }
      if (locked.status !== 'pending_payment') return locked;
      const updated = await this.repository.markPaid(locked.id, fact.occurredAt, transaction);
      if (!updated)
        throw new ApiError(409, 'LESSON_ORDER_VERSION_CONFLICT', '订单已被其他操作更新');
      await this.audit.record(
        {
          actorType: 'provider',
          actorLabel: locked.provider,
          category: 'business',
          action: 'lesson-order.paid',
          resourceType: 'lesson.order',
          resourceId: locked.id,
          changes: [{ field: 'status', before: locked.status, after: updated.status }],
          metadata: { orderNo: locked.orderNo, paymentIntentId: fact.intentId },
        },
        transaction,
      );
      return updated;
    });
    if (paid.status !== 'completed') {
      await this.grant(paid, {
        actorType: 'user',
        actorId: paid.createdByUserId,
        actorLabel: null,
      });
    }
  }

  private async createOfflineLessonPackageOrder(
    institutionId: string,
    input: {
      packageId: string;
      paidAmountMinor: number;
      paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
      receivedAt: string;
      paymentReference?: string | null;
      paymentNote?: string | null;
      priceAdjustmentReason?: string | null;
    },
    student: { id: string; fullName: string },
    guardian: { id: string; fullName: string },
    actorId: string,
    transaction: DatabaseTransaction,
  ) {
    const product = await this.products.getActiveVersion(
      institutionId,
      input.packageId,
      transaction,
    );
    this.assertOfflinePrice(
      input.paidAmountMinor,
      product.priceAmount,
      input.priceAdjustmentReason,
    );
    return this.repository.create(
      {
        ...this.offlineOrderBase(institutionId, input, student, guardian, actorId),
        productType: 'lesson_package',
        packageId: product.packageId,
        packageVersionId: product.id,
        packageVersion: product.version,
        packageName: product.name,
        baseUnits: product.baseUnits,
        bonusUnits: product.bonusUnits,
        listedAmountMinor: product.priceAmount,
        currency: product.currency,
      },
      transaction,
    );
  }

  private async createOfflinePeriodCardOrder(
    institutionId: string,
    input: {
      periodCardProductId: string;
      paidAmountMinor: number;
      paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
      receivedAt: string;
      paymentReference?: string | null;
      paymentNote?: string | null;
      priceAdjustmentReason?: string | null;
    },
    student: { id: string; fullName: string },
    guardian: { id: string; fullName: string },
    actorId: string,
    transaction: DatabaseTransaction,
  ) {
    const product = await this.periodCardProducts.getActiveVersion(
      institutionId,
      input.periodCardProductId,
      transaction,
    );
    this.assertOfflinePrice(
      input.paidAmountMinor,
      product.priceAmount,
      input.priceAdjustmentReason,
    );
    return this.repository.create(
      {
        ...this.offlineOrderBase(institutionId, input, student, guardian, actorId),
        productType: 'period_card',
        periodCardProductId: product.productId,
        periodCardProductVersionId: product.id,
        periodCardProductVersion: product.version,
        periodCardProductName: product.name,
        periodCardMode: product.mode,
        periodCardUsageLimit: product.usageLimit,
        periodCardDurationUnit: product.durationUnit,
        periodCardDurationCount: product.durationCount,
        periodCardActivationPolicy: product.activationPolicy,
        listedAmountMinor: product.priceAmount,
        currency: product.currency,
      },
      transaction,
    );
  }

  private offlineOrderBase(
    institutionId: string,
    input: {
      paidAmountMinor: number;
      paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
      receivedAt: string;
      paymentReference?: string | null;
      paymentNote?: string | null;
      priceAdjustmentReason?: string | null;
    },
    student: { id: string; fullName: string },
    guardian: { id: string; fullName: string },
    actorId: string,
  ) {
    return {
      orderNo: this.orderNo(),
      institutionId,
      studentId: student.id,
      studentName: student.fullName,
      guardianId: guardian.id,
      guardianName: guardian.fullName,
      createdByUserId: actorId,
      sourceType: 'normal' as const,
      sourceReferenceId: null,
      channel: 'offline' as const,
      amountMinor: input.paidAmountMinor,
      depositAppliedMinor: 0,
      balanceDueMinor: input.paidAmountMinor,
      provider: null,
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference ?? null,
      paymentNote: input.paymentNote ?? null,
      priceAdjustmentReason: input.priceAdjustmentReason ?? null,
      receiptNo: this.receiptNo(),
      status: 'paid_pending_grant' as const,
      paidAt: new Date(input.receivedAt),
      expiresAt: null,
      paymentDeadlineAt: null,
    };
  }

  private assertOfflinePrice(
    paidAmountMinor: number,
    listedAmountMinor: number,
    priceAdjustmentReason?: string | null,
  ) {
    if (paidAmountMinor !== listedAmountMinor && !priceAdjustmentReason?.trim()) {
      throw new ApiError(
        400,
        'OFFLINE_ORDER_PRICE_ADJUSTMENT_REASON_REQUIRED',
        '实收金额与商品标价不一致时必须填写调价原因',
      );
    }
  }

  private async createOnlineLessonPackageOrder(
    input: { institutionId: string; studentId: string; packageId: string },
    owner: { guardianId: string; guardianName: string; student: { fullName: string } },
    identityUserId: string,
    provider: PaymentProvider,
    transaction: DatabaseTransaction,
  ) {
    const product = await this.products.getPurchasableVersion(
      input.institutionId,
      input.packageId,
      transaction,
      this.clock(),
    );
    return this.repository.create(
      {
        orderNo: this.orderNo(),
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentName: owner.student.fullName,
        guardianId: owner.guardianId,
        guardianName: owner.guardianName,
        createdByUserId: identityUserId,
        sourceType: 'normal',
        sourceReferenceId: null,
        productType: 'lesson_package',
        packageId: product.packageId,
        packageVersionId: product.id,
        packageVersion: product.version,
        packageName: product.name,
        baseUnits: product.baseUnits,
        bonusUnits: product.bonusUnits,
        channel: 'online',
        listedAmountMinor: product.priceAmount,
        amountMinor: product.priceAmount,
        depositAppliedMinor: 0,
        balanceDueMinor: product.priceAmount,
        currency: product.currency,
        provider,
        paymentMethod: provider === 'wechat_pay' ? 'wechat_pay' : 'mock',
        paymentReference: null,
        paymentNote: null,
        priceAdjustmentReason: null,
        receiptNo: this.receiptNo(),
        expiresAt: new Date(this.clock().getTime() + 30 * 60_000),
        paymentDeadlineAt: null,
      },
      transaction,
    );
  }

  private async createOnlinePeriodCardOrder(
    input: { institutionId: string; studentId: string; periodCardProductId: string },
    owner: { guardianId: string; guardianName: string; student: { fullName: string } },
    identityUserId: string,
    provider: PaymentProvider,
    transaction: DatabaseTransaction,
  ) {
    const product = await this.periodCardProducts.getPurchasableVersion(
      input.institutionId,
      input.periodCardProductId,
      transaction,
      this.clock(),
    );
    return this.repository.create(
      {
        orderNo: this.orderNo(),
        institutionId: input.institutionId,
        studentId: input.studentId,
        studentName: owner.student.fullName,
        guardianId: owner.guardianId,
        guardianName: owner.guardianName,
        createdByUserId: identityUserId,
        sourceType: 'normal',
        sourceReferenceId: null,
        productType: 'period_card',
        periodCardProductId: product.productId,
        periodCardProductVersionId: product.id,
        periodCardProductVersion: product.version,
        periodCardProductName: product.name,
        periodCardMode: product.mode,
        periodCardUsageLimit: product.usageLimit,
        periodCardDurationUnit: product.durationUnit,
        periodCardDurationCount: product.durationCount,
        periodCardActivationPolicy: product.activationPolicy,
        channel: 'online',
        listedAmountMinor: product.priceAmount,
        amountMinor: product.priceAmount,
        depositAppliedMinor: 0,
        balanceDueMinor: product.priceAmount,
        currency: product.currency,
        provider,
        paymentMethod: provider === 'wechat_pay' ? 'wechat_pay' : 'mock',
        paymentReference: null,
        paymentNote: null,
        priceAdjustmentReason: null,
        receiptNo: this.receiptNo(),
        expiresAt: new Date(this.clock().getTime() + 30 * 60_000),
        paymentDeadlineAt: null,
      },
      transaction,
    );
  }

  private async ensurePaymentIntent(
    order: LessonCommerceOrderRecord,
    provider: PaymentProvider,
    context: ActorContext,
  ) {
    if (order.provider !== provider) {
      throw new ApiError(409, 'LESSON_ORDER_PROVIDER_CONFLICT', '订单支付方式不能变更');
    }
    if (order.paymentIntentId) return this.payments.getIntent(order.paymentIntentId);
    const payerOpenId =
      provider === 'wechat_pay' ? await this.payers.openIdForIdentity(context.actorId) : undefined;
    const payment = await this.payments.createIntent(
      {
        merchantReference:
          order.sourceType === 'group_formation'
            ? `${order.orderNo}:balance:${order.revision}`
            : order.orderNo,
        provider,
        amountMinor:
          order.sourceType === 'group_formation' ? order.balanceDueMinor : order.amountMinor,
        currency: order.currency,
        description: this.paymentDescription(order),
      },
      context,
      { payerOpenId },
    );
    const attached = await this.database.transaction((transaction) =>
      this.repository.attachPaymentIntent(order.id, payment.id, transaction),
    );
    if (!attached) {
      const current = await this.requireOrder(order.id);
      if (current.paymentIntentId !== payment.id) {
        throw new ApiError(409, 'LESSON_ORDER_PAYMENT_CONFLICT', '订单支付交易发生并发冲突');
      }
    }
    return payment;
  }

  private async startGroupOnlinePayment(
    initial: LessonCommerceOrderRecord,
    provider: PaymentProvider,
    context: ActorContext,
  ): Promise<{ order: LessonOrder; payment: PaymentIntentDetail }> {
    if (initial.sourceType !== 'group_formation') {
      throw new ApiError(409, 'GROUP_ORDER_REQUIRED', '该订单不是拼课尾款订单');
    }
    if (initial.balanceDueMinor <= 0) {
      throw new ApiError(409, 'GROUP_ORDER_BALANCE_NOT_DUE', '该订单没有待支付尾款');
    }
    if (initial.paymentDeadlineAt && initial.paymentDeadlineAt.getTime() < this.clock().getTime()) {
      throw new ApiError(
        409,
        'GROUP_ORDER_PAYMENT_DEADLINE_PASSED',
        '该拼课订单已超过尾款截止时间',
      );
    }

    let order = initial;
    if (order.status === 'awaiting_settlement') {
      order = await this.database.transaction(async (transaction) => {
        const prepared = await this.repository.prepareOnlineSettlement(
          order.id,
          order.revision,
          provider,
          new Date(this.clock().getTime() + 30 * 60_000),
          transaction,
        );
        if (!prepared) {
          throw new ApiError(409, 'LESSON_ORDER_VERSION_CONFLICT', '订单已变化，请刷新后重试');
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-order.group-balance-online-started',
            resourceType: 'lesson.order',
            resourceId: prepared.id,
            changes: [{ field: 'status', before: order.status, after: prepared.status }],
            metadata: {
              orderNo: prepared.orderNo,
              formationId: prepared.sourceReferenceId,
              balanceDueMinor: prepared.balanceDueMinor,
              provider,
            },
          },
          transaction,
        );
        return prepared;
      });
    } else if (order.status !== 'pending_payment') {
      throw new ApiError(
        409,
        'GROUP_ORDER_NOT_AWAITING_SETTLEMENT',
        '该拼课订单当前不能发起尾款支付',
      );
    }
    if (order.provider !== provider) {
      throw new ApiError(409, 'LESSON_ORDER_PROVIDER_CONFLICT', '订单支付方式不能变更');
    }
    const payment = await this.ensurePaymentIntent(order, provider, context);
    return { order: this.view(await this.requireOrder(order.id)), payment };
  }

  private async grant(order: LessonCommerceOrderRecord, context: ActorContext) {
    try {
      if (order.productType === 'period_card') {
        await this.grantPeriodCard(order, context);
      } else {
        await this.grantLessonPackage(order, context);
      }
    } catch (error) {
      const failure = this.failure(error);
      await this.database.transaction(async (transaction) => {
        const locked = await this.repository.lockById(order.id, transaction);
        if (!locked || locked.status === 'completed') return;
        await this.repository.markGrantFailed(
          locked.id,
          failure.code,
          failure.message,
          transaction,
        );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'lesson-order.grant-failed',
            resourceType: 'lesson.order',
            resourceId: locked.id,
            outcome: 'failure',
            metadata: { orderNo: locked.orderNo, code: failure.code },
          },
          transaction,
        );
      });
      throw error;
    }
  }

  private async grantLessonPackage(order: LessonCommerceOrderRecord, context: ActorContext) {
    if (!order.packageId || !order.packageVersion) {
      throw new ApiError(500, 'LESSON_ORDER_SNAPSHOT_INVALID', '课时包订单快照不完整');
    }
    const result = await this.lessons.grantPurchase(
      {
        institutionId: order.institutionId,
        studentId: order.studentId,
        packageId: order.packageId,
        packageVersion: order.packageVersion,
        orderNo: order.orderNo,
        source: order.channel === 'online' ? 'online_purchase' : 'offline_purchase',
      },
      context,
    );
    await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockById(order.id, transaction);
      if (!locked || locked.status === 'completed') return;
      const completed = await this.repository.markLessonCompleted(
        locked.id,
        result.movement.id,
        transaction,
      );
      if (!completed) {
        throw new ApiError(409, 'LESSON_ORDER_VERSION_CONFLICT', '订单完成状态更新冲突');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-order.completed',
          resourceType: 'lesson.order',
          resourceId: locked.id,
          changes: [{ field: 'status', before: locked.status, after: completed.status }],
          metadata: {
            orderNo: locked.orderNo,
            productType: locked.productType,
            grantMovementId: result.movement.id,
            grantedUnits: result.movement.units,
          },
        },
        transaction,
      );
    });
  }

  private async grantPeriodCard(order: LessonCommerceOrderRecord, context: ActorContext) {
    if (!order.periodCardProductId || !order.periodCardProductVersion) {
      throw new ApiError(500, 'PERIOD_CARD_ORDER_SNAPSHOT_INVALID', '周期卡订单快照不完整');
    }
    await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockById(order.id, transaction);
      if (!locked || locked.status === 'completed') return;
      const entitlement = await this.periodCardEntitlements.issueInTransaction(
        {
          institutionId: locked.institutionId,
          studentId: locked.studentId,
          productId: order.periodCardProductId!,
          productVersion: order.periodCardProductVersion!,
          operationId: locked.id,
          activationStartsAt: null,
          reason: `订单 ${locked.orderNo} 自动发放`,
          sourceType: 'order',
          sourceReference: locked.orderNo,
        },
        context,
        transaction,
      );
      const completed = await this.repository.markPeriodCardCompleted(
        locked.id,
        entitlement.id,
        transaction,
      );
      if (!completed) {
        throw new ApiError(409, 'LESSON_ORDER_VERSION_CONFLICT', '订单完成状态更新冲突');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-order.completed',
          resourceType: 'lesson.order',
          resourceId: locked.id,
          changes: [{ field: 'status', before: locked.status, after: completed.status }],
          metadata: {
            orderNo: locked.orderNo,
            productType: locked.productType,
            periodCardEntitlementId: entitlement.id,
          },
        },
        transaction,
      );
    });
  }

  private paymentDescription(order: LessonCommerceOrderRecord) {
    if (order.productType === 'period_card') {
      const duration = `${order.periodCardDurationCount}${
        order.periodCardDurationUnit === 'day'
          ? '天'
          : order.periodCardDurationUnit === 'week'
            ? '周'
            : '个月'
      }`;
      const usage =
        order.periodCardMode === 'unlimited' ? '不限次' : `${order.periodCardUsageLimit}次`;
      return `${order.periodCardProductName}（${duration}，${usage}）`;
    }
    return `${order.packageName}（${(order.baseUnits ?? 0) + (order.bonusUnits ?? 0)}课时）`;
  }

  private async closeFromPayment(order: LessonCommerceOrderRecord, fact: PaymentFact) {
    await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockById(order.id, transaction);
      if (!locked || locked.status !== 'pending_payment') return;
      if (locked.sourceType === 'group_formation') {
        const restored = await this.repository.restoreAwaitingSettlement(locked.id, transaction);
        if (!restored) return;
        await this.audit.record(
          {
            actorType: 'provider',
            actorLabel: order.provider,
            category: 'business',
            action: 'lesson-order.group-balance-payment-reset',
            resourceType: 'lesson.order',
            resourceId: order.id,
            changes: [{ field: 'status', before: locked.status, after: restored.status }],
            metadata: { paymentStatus: fact.status, paymentIntentId: fact.intentId },
          },
          transaction,
        );
        return;
      }
      const closed = await this.repository.markClosed(locked.id, transaction);
      if (!closed) return;
      await this.audit.record(
        {
          actorType: 'provider',
          actorLabel: order.provider,
          category: 'business',
          action: 'lesson-order.closed',
          resourceType: 'lesson.order',
          resourceId: order.id,
          changes: [{ field: 'status', before: locked.status, after: closed.status }],
          metadata: { paymentStatus: fact.status },
        },
        transaction,
      );
    });
  }

  private async closeExpiredWithoutPayment(
    order: LessonCommerceOrderRecord,
    context: ActorContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockById(order.id, transaction);
      if (!locked || locked.status !== 'pending_payment') return;
      const closed = await this.repository.markClosed(locked.id, transaction);
      if (!closed) return;
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'lesson-order.expired',
          resourceType: 'lesson.order',
          resourceId: locked.id,
          changes: [{ field: 'status', before: locked.status, after: closed.status }],
          metadata: { orderNo: locked.orderNo },
        },
        transaction,
      );
    });
  }

  private async requireOrder(id: string, transaction?: DatabaseTransaction) {
    const order = await this.repository.findById(id, transaction);
    if (!order) throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
    return order;
  }

  private async assertGuardianOwned(order: LessonCommerceOrderRecord, identityUserId: string) {
    const guardian = await this.people.guardianForIdentity(identityUserId);
    if (order.guardianId !== guardian.id) {
      throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
    }
  }

  private async requireGroupOrder(institutionId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    if (order.institutionId !== institutionId || order.sourceType !== 'group_formation') {
      throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '拼课订单不存在');
    }
    return order;
  }

  private assertGroupOrderDefinition(
    order: LessonCommerceOrderRecord,
    input: Parameters<GroupFormationOrderIssuer['ensureGroupFormationOrders']>[0],
    member: Parameters<
      GroupFormationOrderIssuer['ensureGroupFormationOrders']
    >[0]['members'][number],
  ) {
    if (
      order.institutionId !== input.institutionId ||
      order.sourceReferenceId !== input.formationId ||
      order.packageId !== input.packageId ||
      order.packageVersion !== input.packageVersion ||
      order.guardianId !== member.guardianId ||
      order.amountMinor !== member.totalAmountMinor ||
      order.depositAppliedMinor !== member.depositAppliedMinor ||
      order.balanceDueMinor !== member.balanceDueMinor
    ) {
      throw new ApiError(
        409,
        'GROUP_FORMATION_ORDER_DEFINITION_CONFLICT',
        '既有拼课订单与成班结论不一致',
      );
    }
  }

  private businessOrderNo(merchantReference: string) {
    return merchantReference.split(':balance:', 1)[0]!;
  }

  private isUniqueViolation(error: unknown) {
    return (
      typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
    );
  }

  private page(
    result: { items: LessonCommerceOrderRecord[]; total: number },
    input: LessonOrderListQuery,
  ) {
    return {
      items: result.items.map((item) => this.view(item)),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  private view(record: LessonCommerceOrderRecord): LessonOrder {
    const common = {
      id: record.id,
      orderNo: record.orderNo,
      institutionId: record.institutionId,
      studentId: record.studentId,
      studentName: record.studentName,
      guardianId: record.guardianId,
      guardianName: record.guardianName,
      sourceType: record.sourceType,
      sourceReferenceId: record.sourceReferenceId,
      channel: record.channel,
      listedAmountMinor: record.listedAmountMinor,
      amountMinor: record.amountMinor,
      depositAppliedMinor: record.depositAppliedMinor,
      balanceDueMinor: record.balanceDueMinor,
      currency: record.currency,
      provider: record.provider,
      paymentMethod: record.paymentMethod,
      paymentReference: record.paymentReference,
      paymentNote: record.paymentNote,
      priceAdjustmentReason: record.priceAdjustmentReason,
      receiptNo: record.receiptNo,
      paymentIntentId: record.paymentIntentId,
      status: record.status,
      failureCode: record.failureCode,
      failureMessage: record.failureMessage,
      paidAt: record.paidAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      paymentDeadlineAt: record.paymentDeadlineAt?.toISOString() ?? null,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
    if (record.productType === 'period_card') {
      if (
        !record.periodCardProductId ||
        !record.periodCardProductVersionId ||
        !record.periodCardProductVersion ||
        !record.periodCardProductName ||
        !record.periodCardMode ||
        !record.periodCardDurationUnit ||
        !record.periodCardDurationCount ||
        !record.periodCardActivationPolicy
      ) {
        throw new ApiError(500, 'PERIOD_CARD_ORDER_SNAPSHOT_INVALID', '周期卡订单快照不完整');
      }
      return {
        ...common,
        productType: 'period_card',
        packageId: null,
        packageVersionId: null,
        packageVersion: null,
        packageName: null,
        baseUnits: null,
        bonusUnits: null,
        periodCardProductId: record.periodCardProductId,
        periodCardProductVersionId: record.periodCardProductVersionId,
        periodCardProductVersion: record.periodCardProductVersion,
        periodCardProductName: record.periodCardProductName,
        periodCardMode: record.periodCardMode,
        periodCardUsageLimit: record.periodCardUsageLimit,
        periodCardDurationUnit: record.periodCardDurationUnit,
        periodCardDurationCount: record.periodCardDurationCount,
        periodCardActivationPolicy: record.periodCardActivationPolicy,
        grantMovementId: null,
        periodCardEntitlementId: record.periodCardEntitlementId,
      };
    }
    if (
      !record.packageId ||
      !record.packageVersionId ||
      !record.packageVersion ||
      !record.packageName ||
      !record.baseUnits ||
      record.bonusUnits === null
    ) {
      throw new ApiError(500, 'LESSON_ORDER_SNAPSHOT_INVALID', '课时包订单快照不完整');
    }
    return {
      ...common,
      productType: 'lesson_package',
      packageId: record.packageId,
      packageVersionId: record.packageVersionId,
      packageVersion: record.packageVersion,
      packageName: record.packageName,
      baseUnits: record.baseUnits,
      bonusUnits: record.bonusUnits,
      periodCardProductId: null,
      periodCardProductVersionId: null,
      periodCardProductVersion: null,
      periodCardProductName: null,
      periodCardMode: null,
      periodCardUsageLimit: null,
      periodCardDurationUnit: null,
      periodCardDurationCount: null,
      periodCardActivationPolicy: null,
      grantMovementId: record.grantMovementId,
      periodCardEntitlementId: null,
    };
  }

  private orderNo() {
    const stamp = this.clock()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    return `LE${stamp}${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private receiptNo() {
    const stamp = this.clock()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    return `RC${stamp}${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private async receipt(order: LessonCommerceOrderRecord): Promise<LessonReceipt> {
    if (!['completed', 'refunding', 'refunded'].includes(order.status)) {
      throw new ApiError(409, 'LESSON_ORDER_RECEIPT_NOT_READY', '订单完成后才能生成收据');
    }
    const [organization, institution] = await Promise.all([
      this.institutions.getProfile(),
      this.institutions.getInstitution(order.institutionId),
    ]);
    return {
      receiptNo: order.receiptNo,
      title: '收据',
      issuedAt: (order.completedAt ?? order.paidAt ?? order.updatedAt).toISOString(),
      settlementMark:
        order.sourceType === 'normal' && order.paymentMethod === 'cash' ? '现金收讫' : '款项已收',
      amountUppercase: amountInChineseUppercase(order.amountMinor),
      organization: {
        name: organization.name,
        brandName: organization.brandName,
        logoUrl: organization.logoUrl,
        phone: organization.phone,
        address: organization.address,
      },
      institution: {
        id: institution.id,
        name: institution.name,
        phone: institution.contactPhone,
        address: institution.address,
      },
      order: this.view(order),
    };
  }

  private async assertOnlineSalesEnabled() {
    if (!(await this.onlineSalesEnabled())) {
      throw new ApiError(409, 'ONLINE_LESSON_SALES_DISABLED', '当前未开放小程序在线购买课时包');
    }
  }

  private async onlineSalesEnabled() {
    return (
      (await this.settings.getValue<boolean>('education-commerce.online-sales-enabled')) !== false
    );
  }

  private failure(error: unknown) {
    if (error instanceof ApiError) {
      return { code: error.code, message: error.message };
    }
    return {
      code: 'ORDER_FULFILLMENT_FAILED',
      message: '支付成功，商品权益发放失败，系统将自动重试',
    };
  }
}

function deterministicUuid(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function amountInChineseUppercase(amountMinor: number): string {
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const sections = ['', '万', '亿'];
  const integer = Math.floor(amountMinor / 100);
  const fraction = amountMinor % 100;

  const sectionText = (value: number) => {
    let result = '';
    let zero = false;
    for (let index = 0; index < 4; index += 1) {
      const digit = value % 10;
      if (digit === 0) {
        zero = result.length > 0;
      } else {
        result = `${zero ? '零' : ''}${digits[digit]}${units[index]}${result}`;
        zero = false;
      }
      value = Math.floor(value / 10);
    }
    return result;
  };

  let remaining = integer;
  let integerText = '';
  let sectionIndex = 0;
  let pendingZero = false;
  while (remaining > 0) {
    const section = remaining % 10_000;
    if (section === 0) {
      pendingZero = integerText.length > 0;
    } else {
      const prefix = sectionText(section);
      integerText = `${prefix}${sections[sectionIndex]}${pendingZero ? '零' : ''}${integerText}`;
      pendingZero = section < 1_000;
    }
    remaining = Math.floor(remaining / 10_000);
    sectionIndex += 1;
  }
  const yuan = `${integerText || '零'}元`;
  const jiao = Math.floor(fraction / 10);
  const fen = fraction % 10;
  if (jiao === 0 && fen === 0) return `${yuan}整`;
  return `${yuan}${jiao ? `${digits[jiao]}角` : fen ? '零' : ''}${fen ? `${digits[fen]}分` : ''}`;
}
