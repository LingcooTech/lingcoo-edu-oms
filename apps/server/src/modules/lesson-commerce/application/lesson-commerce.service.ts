import { randomBytes } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  lessonOrderSchema,
  type CreateOfflineLessonOrderRequest,
  type CreateLessonOrderRequest,
  type LessonOrder,
  type LessonOrderListQuery,
  type LessonReceipt,
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
import type { SettingsReader } from '../../settings/public.js';
import type {
  LessonCommerceInstitutionDirectory,
  LessonCommercePeopleDirectory,
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
    private readonly people: LessonCommercePeopleDirectory,
    private readonly products: LessonPackageDirectory,
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
            channel: 'online',
            listedAmountMinor: product.priceAmount,
            amountMinor: product.priceAmount,
            currency: product.currency,
            provider,
            paymentMethod: provider === 'wechat_pay' ? 'wechat_pay' : 'mock',
            paymentReference: null,
            paymentNote: null,
            priceAdjustmentReason: null,
            receiptNo: this.receiptNo(),
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
        const product = await this.products.getActiveVersion(
          institutionId,
          input.packageId,
          transaction,
        );
        if (input.paidAmountMinor !== product.priceAmount && !input.priceAdjustmentReason?.trim()) {
          throw new ApiError(
            400,
            'OFFLINE_ORDER_PRICE_ADJUSTMENT_REASON_REQUIRED',
            '实收金额与课时包标价不一致时必须填写调价原因',
          );
        }
        const now = this.clock();
        const order = await this.repository.create(
          {
            orderNo: this.orderNo(),
            institutionId,
            studentId: student.id,
            studentName: student.fullName,
            guardianId: guardian.id,
            guardianName: guardian.fullName,
            createdByUserId: context.actorId,
            packageId: product.packageId,
            packageVersionId: product.id,
            packageVersion: product.version,
            packageName: product.name,
            baseUnits: product.baseUnits,
            bonusUnits: product.bonusUnits,
            channel: 'offline',
            listedAmountMinor: product.priceAmount,
            amountMinor: input.paidAmountMinor,
            currency: product.currency,
            provider: null,
            paymentMethod: input.paymentMethod,
            paymentReference: input.paymentReference ?? null,
            paymentNote: input.paymentNote ?? null,
            priceAdjustmentReason: input.priceAdjustmentReason ?? null,
            receiptNo: this.receiptNo(),
            status: 'paid_pending_grant',
            paidAt: new Date(input.receivedAt),
            expiresAt: null,
          },
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
              packageVersion: order.packageVersion,
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

  async getForGuardian(identityUserId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    this.assertOwned(order, identityUserId);
    return this.view(order);
  }

  async receiptForGuardian(identityUserId: string, orderId: string): Promise<LessonReceipt> {
    const order = await this.requireOrder(orderId);
    this.assertOwned(order, identityUserId);
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
          source: order.channel === 'online' ? 'online_purchase' : 'offline_purchase',
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
      channel: record.channel,
      listedAmountMinor: record.listedAmountMinor,
      amountMinor: record.amountMinor,
      currency: record.currency,
      provider: record.provider,
      paymentMethod: record.paymentMethod,
      paymentReference: record.paymentReference,
      paymentNote: record.paymentNote,
      priceAdjustmentReason: record.priceAdjustmentReason,
      receiptNo: record.receiptNo,
      paymentIntentId: record.paymentIntentId,
      grantMovementId: record.grantMovementId,
      status: record.status,
      failureCode: record.failureCode,
      failureMessage: record.failureMessage,
      paidAt: record.paidAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
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
      settlementMark: order.paymentMethod === 'cash' ? '现金收讫' : '款项已收',
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
    return { code: 'LESSON_GRANT_FAILED', message: '支付成功，课时发放失败，系统将自动重试' };
  }
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
