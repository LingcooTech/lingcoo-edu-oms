import { randomBytes } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  lessonOrderSchema,
  type CreateLessonOrderRequest,
  type LessonOrder,
  type LessonOrderListQuery,
  type MiniStudentListQuery,
  type PaymentIntentDetail,
  type PaymentProvider,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { IdempotencyService } from '../../idempotency/public.js';
import type { LessonPurchaseGrantLedger } from '../../lesson-accounts/public.js';
import type { LessonPackageDirectory } from '../../lesson-products/public.js';
import type { PaymentFact, PaymentFactReceiver } from '../../payments/public.js';
import type { GuardianSelfDirectory } from '../../people/public.js';
import type {
  LessonCommerceInstitutionDirectory,
  LessonCommercePayments,
  WechatMiniPayerDirectory,
} from '../domain/model.js';
import {
  LessonCommerceRepository,
  type LessonCommerceOrderRecord,
} from '../infrastructure/persistence/lesson-commerce.repository.js';

type ActorContext = AuditContext & { actorId: string };

export class LessonCommerceService implements PaymentFactReceiver {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: LessonCommerceRepository,
    private readonly institutions: LessonCommerceInstitutionDirectory,
    private readonly people: GuardianSelfDirectory,
    private readonly products: LessonPackageDirectory,
    private readonly lessons: LessonPurchaseGrantLedger,
    private readonly payments: LessonCommercePayments,
    private readonly payers: WechatMiniPayerDirectory,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  listStudents(identityUserId: string, input: MiniStudentListQuery) {
    return this.people.listStudentsForGuardian(identityUserId, input.institutionId, input);
  }

  listInstitutions() {
    return this.institutions.list({ page: 1, pageSize: 100, status: 'active' }, null);
  }

  listPackages(institutionId: string) {
    return this.products.listPurchasable(institutionId, this.clock());
  }

  onboardStudent(
    identityUserId: string,
    input: {
      institutionId: string;
      guardianName: string;
      relationship: string;
      student: Parameters<GuardianSelfDirectory['onboardStudentForGuardian']>[2];
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
        const product = await this.products.getPurchasableVersion(
          input.institutionId,
          input.packageId,
          transaction,
          this.clock(),
        );
        const order = await this.repository.create(
          {
            orderNo: this.orderNo(),
            institutionId: input.institutionId,
            studentId: input.studentId,
            studentName: owner.student.fullName,
            guardianId: owner.guardianId,
            guardianName: owner.guardianName,
            createdByUserId: identityUserId,
            packageId: product.packageId,
            packageVersionId: product.id,
            packageVersion: product.version,
            packageName: product.name,
            baseUnits: product.baseUnits,
            bonusUnits: product.bonusUnits,
            amountMinor: product.priceAmount,
            currency: product.currency,
            provider,
            expiresAt: new Date(this.clock().getTime() + 30 * 60_000),
          },
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
              packageId: order.packageId,
              packageVersion: order.packageVersion,
              currency: order.currency,
            },
          },
          transaction,
        );
        return this.view(order);
      },
    );

    let order = await this.requireOrder(claimed.value.id);
    this.assertOwned(order, identityUserId);
    if (order.status === 'pending_payment' && order.expiresAt.getTime() <= this.clock().getTime()) {
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

  async getForGuardian(identityUserId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    this.assertOwned(order, identityUserId);
    return this.view(order);
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

  async syncForGuardian(identityUserId: string, orderId: string, context: ActorContext) {
    const order = await this.requireOrder(orderId);
    this.assertOwned(order, identityUserId);
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

  async assertRefundAllowed(request: { merchantReference: string }): Promise<void> {
    const order = await this.repository.findByOrderNo(request.merchantReference);
    if (order) {
      throw new ApiError(
        409,
        'LESSON_ORDER_REFUND_WORKFLOW_REQUIRED',
        '购课订单必须通过专用退课退款流程处理，不能直接退款',
      );
    }
  }

  async receive(fact: PaymentFact): Promise<void> {
    const order = await this.repository.findByOrderNo(fact.merchantReference);
    if (!order) return;
    if (order.paymentIntentId !== fact.intentId) {
      throw new ApiError(409, 'LESSON_ORDER_PAYMENT_IDENTITY_MISMATCH', '订单支付身份不匹配');
    }
    if (order.amountMinor !== fact.amountMinor || order.currency !== fact.currency) {
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
        merchantReference: order.orderNo,
        provider,
        amountMinor: order.amountMinor,
        currency: order.currency,
        description: `${order.packageName}（${order.baseUnits + order.bonusUnits}课时）`,
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

  private async grant(order: LessonCommerceOrderRecord, context: ActorContext) {
    try {
      const result = await this.lessons.grantPurchase(
        {
          institutionId: order.institutionId,
          studentId: order.studentId,
          packageId: order.packageId,
          packageVersion: order.packageVersion,
          orderNo: order.orderNo,
        },
        context,
      );
      await this.database.transaction(async (transaction) => {
        const locked = await this.repository.lockById(order.id, transaction);
        if (!locked || locked.status === 'completed') return;
        const completed = await this.repository.markCompleted(
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
              grantMovementId: result.movement.id,
              grantedUnits: result.movement.units,
            },
          },
          transaction,
        );
      });
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

  private async closeFromPayment(order: LessonCommerceOrderRecord, fact: PaymentFact) {
    await this.database.transaction(async (transaction) => {
      const locked = await this.repository.lockById(order.id, transaction);
      if (!locked || locked.status !== 'pending_payment') return;
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

  private assertOwned(order: LessonCommerceOrderRecord, identityUserId: string) {
    if (order.createdByUserId !== identityUserId) {
      throw new ApiError(404, 'LESSON_ORDER_NOT_FOUND', '购课订单不存在');
    }
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
    return {
      id: record.id,
      orderNo: record.orderNo,
      institutionId: record.institutionId,
      studentId: record.studentId,
      studentName: record.studentName,
      guardianId: record.guardianId,
      guardianName: record.guardianName,
      packageId: record.packageId,
      packageVersionId: record.packageVersionId,
      packageVersion: record.packageVersion,
      packageName: record.packageName,
      baseUnits: record.baseUnits,
      bonusUnits: record.bonusUnits,
      amountMinor: record.amountMinor,
      currency: record.currency,
      provider: record.provider,
      paymentIntentId: record.paymentIntentId,
      grantMovementId: record.grantMovementId,
      status: record.status,
      failureCode: record.failureCode,
      failureMessage: record.failureMessage,
      paidAt: record.paidAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt.toISOString(),
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private orderNo() {
    const stamp = this.clock()
      .toISOString()
      .replace(/[-:TZ.]/g, '')
      .slice(0, 14);
    return `LE${stamp}${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private failure(error: unknown) {
    if (error instanceof ApiError) {
      return { code: error.code, message: error.message };
    }
    return { code: 'LESSON_GRANT_FAILED', message: '支付成功，课时发放失败，系统将自动重试' };
  }
}
