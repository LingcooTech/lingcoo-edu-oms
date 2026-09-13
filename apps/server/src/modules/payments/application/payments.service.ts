import { ApiError } from '@lingcoo-tech/http';
import type {
  CreatePaymentIntentRequest,
  CreatePaymentRefundRequest,
  PaymentCallbackQuery,
  PaymentIntentDetail,
  PaymentIntentQuery,
  PaymentIntentStatus,
  PaymentProvider,
  PaymentRefund,
  PaymentRefundQuery,
  PaymentTransactionQuery,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type {
  PaymentCallbackHeaders,
  PaymentFactReceiver,
  PaymentProviderAdapter,
  VerifiedPaymentCallback,
} from '../domain/model.js';
import { callbackStatus } from '../domain/model.js';
import type { PaymentsRepository } from '../infrastructure/persistence/payments.repository.js';

type ActorContext = AuditContext & { actorId: string };
type StoredIntent = NonNullable<Awaited<ReturnType<PaymentsRepository['findIntent']>>>;
type StoredRefund = NonNullable<Awaited<ReturnType<PaymentsRepository['findRefundByRequest']>>>;

export class PaymentsService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: PaymentsRepository,
    private readonly providers: ReadonlyMap<string, PaymentProviderAdapter>,
    private readonly audit: AuditWriter,
    private readonly facts: PaymentFactReceiver,
  ) {}

  async createIntent(
    input: CreatePaymentIntentRequest,
    context: ActorContext,
    providerContext?: { payerOpenId?: string },
  ): Promise<PaymentIntentDetail> {
    const provider = this.provider(input.provider ?? 'mock');
    const configuration = await provider.configuration();
    const claimed = await this.database.transaction(async (transaction) => {
      const existing = await this.repository.findIntentByReference(
        input.merchantReference,
        transaction,
      );
      if (existing) {
        this.assertSameIntent(existing, input);
        return existing;
      }
      const created = await this.repository.insertIntent(
        {
          merchantReference: input.merchantReference,
          provider: input.provider ?? 'mock',
          amountMinor: input.amountMinor,
          currency: input.currency ?? 'CNY',
          description: input.description,
          providerAppId: configuration.appId,
          providerMerchantId: configuration.merchantId,
          createdBy: context.actorId,
        },
        transaction,
      );
      if (!created) {
        const raced = await this.repository.findIntentByReference(
          input.merchantReference,
          transaction,
        );
        if (!raced) throw new Error('Payment intent identity conflict was not observable');
        this.assertSameIntent(raced, input);
        return raced;
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'payment.intent.created',
          resourceType: 'payment.intent',
          resourceId: created.id,
          metadata: {
            merchantReference: created.merchantReference,
            provider: created.provider,
            amountMinor: created.amountMinor,
            currency: created.currency,
          },
        },
        transaction,
      );
      return created;
    });

    if (!(await this.repository.latestTransaction(claimed.id))) {
      try {
        const result = await provider.create({
          intentId: claimed.id,
          merchantReference: claimed.merchantReference,
          amountMinor: claimed.amountMinor,
          currency: claimed.currency,
          description: claimed.description,
          providerContext,
        });
        await this.database.transaction(async (transaction) => {
          const locked = await this.requireLockedIntent(claimed.id, transaction);
          const existing = await this.repository.findTransactionByProviderId(
            locked.provider,
            result.providerTransactionId,
            transaction,
          );
          if (!existing) {
            await this.repository.insertTransaction(
              {
                intentId: locked.id,
                provider: locked.provider,
                providerTransactionId: result.providerTransactionId,
                amountMinor: locked.amountMinor,
                currency: locked.currency,
                status: result.status,
                clientPayload: result.clientPayload,
                providerMetadata: result.providerMetadata,
              },
              transaction,
            );
          }
          if (locked.status === 'created' || locked.status === 'unknown') {
            await this.repository.setIntentStatus(
              locked.id,
              this.intentStatus(result.status),
              {},
              transaction,
            );
          }
        });
      } catch (error) {
        await this.database.transaction(async (transaction) => {
          const locked = await this.requireLockedIntent(claimed.id, transaction);
          if (locked.status === 'created')
            await this.repository.setIntentStatus(locked.id, 'unknown', {}, transaction);
        });
        throw error;
      }
    }
    return this.getIntent(claimed.id);
  }

  async getIntent(id: string): Promise<PaymentIntentDetail> {
    const intent = await this.repository.findIntent(id);
    if (!intent) throw new ApiError(404, 'PAYMENT_INTENT_NOT_FOUND', '支付意图不存在');
    const [transactions, refunds] = await Promise.all([
      this.repository.transactionsForIntent(id),
      this.repository.refundsForIntent(id),
    ]);
    return {
      ...this.intentView(intent),
      transactions: transactions.map(transactionView),
      refunds: refunds.map(refundView),
    };
  }

  async listIntents(query: PaymentIntentQuery) {
    const result = await this.repository.listIntents(query);
    return {
      items: result.items.map((item) => this.intentView(item)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async listTransactions(query: PaymentTransactionQuery) {
    const result = await this.repository.listTransactions(query);
    return {
      items: result.items.map(transactionView),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async listRefunds(query: PaymentRefundQuery) {
    const result = await this.repository.listRefunds(query);
    return {
      items: result.items.map(refundView),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async listCallbacks(query: PaymentCallbackQuery) {
    const result = await this.repository.listCallbacks(query);
    return {
      items: result.items.map(callbackView),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async close(id: string, context: ActorContext) {
    const current = await this.getIntentRecord(id);
    if (['succeeded', 'partially_refunded', 'refunded'].includes(current.status)) {
      throw new ApiError(409, 'PAYMENT_INTENT_NOT_CLOSABLE', '已支付或退款的支付意图不能关闭');
    }
    if (current.status === 'closed') return this.getIntent(id);
    const transaction = await this.requireTransaction(id);
    const result = await this.provider(current.provider).close(transaction.providerTransactionId);
    await this.applyProviderStatus(
      current.id,
      transaction.id,
      result.status,
      false,
      context,
      'payment.intent.closed',
    );
    await this.emitFact(id);
    return this.getIntent(id);
  }

  async reconcile(id: string, context: ActorContext) {
    const current = await this.getIntentRecord(id);
    let transaction = await this.repository.latestTransaction(id);
    if (!transaction) {
      const created = await this.provider(current.provider).create({
        intentId: current.id,
        merchantReference: current.merchantReference,
        amountMinor: current.amountMinor,
        currency: current.currency,
        description: current.description,
      });
      transaction = await this.database.transaction(async (databaseTransaction) => {
        const locked = await this.requireLockedIntent(id, databaseTransaction);
        const existing = await this.repository.findTransactionByProviderId(
          locked.provider,
          created.providerTransactionId,
          databaseTransaction,
        );
        const saved =
          existing ??
          (await this.repository.insertTransaction(
            {
              intentId: locked.id,
              provider: locked.provider,
              providerTransactionId: created.providerTransactionId,
              amountMinor: locked.amountMinor,
              currency: locked.currency,
              status: created.status,
              clientPayload: created.clientPayload,
              providerMetadata: created.providerMetadata,
            },
            databaseTransaction,
          ));
        if (!saved) throw new Error('Reconciled provider transaction was not persisted');
        return saved;
      });
    }
    const result = await this.provider(current.provider).query(transaction.providerTransactionId);
    await this.applyProviderStatus(
      current.id,
      transaction.id,
      result.status,
      true,
      context,
      'payment.intent.reconciled',
      result.providerMetadata,
    );
    await this.emitFact(id);
    return this.getIntent(id);
  }

  async refund(
    id: string,
    input: CreatePaymentRefundRequest,
    context: ActorContext,
  ): Promise<PaymentRefund> {
    const refundIntent = await this.getIntentRecord(id);
    await this.facts.assertRefundAllowed?.({
      intentId: refundIntent.id,
      merchantReference: refundIntent.merchantReference,
      amountMinor: input.amountMinor,
      reason: input.reason,
    });
    return this.executeRefund(id, input, context);
  }

  async refundForBusinessWorkflow(
    id: string,
    input: CreatePaymentRefundRequest,
    context: ActorContext,
  ): Promise<PaymentRefund> {
    return this.executeRefund(id, input, context);
  }

  private async executeRefund(
    id: string,
    input: CreatePaymentRefundRequest,
    context: ActorContext,
  ): Promise<PaymentRefund> {
    const reservation = await this.database.transaction(async (transaction) => {
      const intent = await this.requireLockedIntent(id, transaction);
      const duplicate = await this.repository.findRefundByRequest(
        id,
        input.requestKey,
        transaction,
      );
      if (duplicate) {
        if (duplicate.amountMinor !== input.amountMinor || duplicate.reason !== input.reason) {
          throw new ApiError(
            409,
            'PAYMENT_REFUND_IDEMPOTENCY_CONFLICT',
            '相同退款请求键已用于不同请求',
          );
        }
        return duplicate;
      }
      if (!['succeeded', 'partially_refunded'].includes(intent.status)) {
        throw new ApiError(409, 'PAYMENT_INTENT_NOT_REFUNDABLE', '只有支付成功的交易可以退款');
      }
      const reserved = await this.repository.reservedRefundAmount(id, transaction);
      if (reserved + input.amountMinor > intent.amountMinor) {
        throw new ApiError(409, 'PAYMENT_REFUND_EXCEEDS_AVAILABLE', '退款金额超过可退款余额');
      }
      const created = await this.repository.insertRefund(
        {
          intentId: id,
          requestKey: input.requestKey,
          amountMinor: input.amountMinor,
          reason: input.reason,
          createdBy: context.actorId,
        },
        transaction,
      );
      if (!created)
        throw new ApiError(409, 'PAYMENT_REFUND_IDEMPOTENCY_CONFLICT', '退款请求发生并发冲突');
      return created;
    });
    if (reservation.status === 'succeeded' || reservation.status === 'failed') {
      return refundView(reservation);
    }

    const intent = await this.getIntentRecord(id);
    const transaction = await this.requireTransaction(id);
    try {
      const result = reservation.providerRefundId
        ? await this.provider(intent.provider).queryRefund(reservation.id)
        : await this.provider(intent.provider).refund({
            providerTransactionId: transaction.providerTransactionId,
            refundId: reservation.id,
            amountMinor: reservation.amountMinor,
            totalAmountMinor: intent.amountMinor,
            currency: intent.currency,
            reason: reservation.reason,
          });
      const saved = await this.database.transaction(async (databaseTransaction) => {
        const locked = await this.requireLockedIntent(id, databaseTransaction);
        const latest = await this.repository.findRefundByRequest(
          id,
          reservation.requestKey,
          databaseTransaction,
        );
        if (!latest) throw new Error('Payment refund disappeared');
        if (latest.status === 'succeeded') return latest;
        const updated = await this.repository.setRefundResult(
          reservation.id,
          result.providerRefundId,
          result.status,
          databaseTransaction,
        );
        if (!updated) throw new Error('Payment refund disappeared');
        if (result.status === 'succeeded') {
          const refundedAmountMinor = locked.refundedAmountMinor + updated.amountMinor;
          const status =
            refundedAmountMinor === locked.amountMinor ? 'refunded' : 'partially_refunded';
          await this.repository.setIntentStatus(
            id,
            status,
            { refundedAmountMinor },
            databaseTransaction,
          );
          await this.audit.record(
            {
              ...context,
              category: 'business',
              action: 'payment.refund.succeeded',
              resourceType: 'payment.refund',
              resourceId: updated.id,
              metadata: {
                intentId: id,
                amountMinor: updated.amountMinor,
                currency: locked.currency,
              },
            },
            databaseTransaction,
          );
        }
        return updated;
      });
      if (result.status === 'succeeded') await this.emitFact(id);
      return refundView(saved);
    } catch (error) {
      await this.database.transaction((databaseTransaction) =>
        this.repository.setRefundResult(reservation.id, null, 'unknown', databaseTransaction),
      );
      throw error;
    }
  }

  async callback(
    providerKey: PaymentProvider,
    input: unknown,
    signature: string | undefined,
    rawBody: Buffer,
    context: AuditContext,
    headers: PaymentCallbackHeaders = {},
  ) {
    const verified = await this.provider(providerKey).verifyCallback(
      input,
      signature,
      rawBody,
      headers,
    );
    if (verified.provider !== providerKey) {
      throw new ApiError(400, 'PAYMENT_CALLBACK_PROVIDER_MISMATCH', '支付回调 Provider 不匹配');
    }
    const result = await this.database.transaction(async (transaction) => {
      const providerTransaction = await this.repository.findTransactionByProviderId(
        verified.provider,
        verified.providerTransactionId,
        transaction,
      );
      if (!providerTransaction)
        throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND', 'Provider 交易不存在');
      const intent = await this.requireLockedIntent(providerTransaction.intentId, transaction);
      this.validateCallback(intent, providerTransaction, verified);
      const duplicate = await this.repository.findCallback(
        verified.provider,
        verified.providerEventId,
        transaction,
      );
      if (duplicate) {
        if (duplicate.payloadHash !== verified.payloadHash) {
          throw new ApiError(
            409,
            'PAYMENT_CALLBACK_IDENTITY_CONFLICT',
            '相同回调事件 ID 对应不同内容',
          );
        }
        return { intent, deduplicated: true };
      }
      const status = callbackStatus(verified.eventType);
      const callback = await this.repository.insertCallback(
        {
          intentId: intent.id,
          provider: verified.provider,
          providerEventId: verified.providerEventId,
          providerTransactionId: verified.providerTransactionId,
          eventType: verified.eventType,
          amountMinor: verified.amountMinor,
          currency: verified.currency,
          payloadHash: verified.payloadHash,
          processedAt: new Date(),
        },
        transaction,
      );
      if (!callback)
        throw new ApiError(409, 'PAYMENT_CALLBACK_IDENTITY_CONFLICT', '回调事件发生并发冲突');
      await this.repository.setTransactionStatus(
        providerTransaction.id,
        status,
        false,
        transaction,
        verified.providerMetadata,
      );
      const next = this.callbackIntentStatus(intent.status, status);
      const updated = await this.repository.setIntentStatus(
        intent.id,
        next,
        {
          paidAt: next === 'succeeded' ? new Date(verified.occurredAt) : intent.paidAt,
          closedAt: next === 'closed' ? new Date(verified.occurredAt) : intent.closedAt,
        },
        transaction,
      );
      await this.audit.record(
        {
          ...context,
          actorType: 'provider',
          actorLabel: verified.provider,
          category: 'business',
          action: `payment.callback.${status}`,
          resourceType: 'payment.intent',
          resourceId: intent.id,
          metadata: {
            providerEventId: verified.providerEventId,
            providerTransactionId: verified.providerTransactionId,
          },
        },
        transaction,
      );
      return { intent: updated!, deduplicated: false };
    });
    await this.emitFact(result.intent.id);
    return {
      accepted: true as const,
      deduplicated: result.deduplicated,
      intentId: result.intent.id,
      status: result.intent.status as PaymentIntentStatus,
    };
  }

  private async applyProviderStatus(
    intentId: string,
    transactionId: string,
    status: string,
    queried: boolean,
    context: ActorContext,
    action: string,
    providerMetadata?: Record<string, unknown>,
  ) {
    await this.database.transaction(async (transaction) => {
      const intent = await this.requireLockedIntent(intentId, transaction);
      const next = this.intentStatus(status);
      const paid = ['succeeded', 'partially_refunded', 'refunded'].includes(intent.status);
      const closed = intent.status === 'closed';
      const regressive = (paid && next !== 'succeeded') || (closed && next !== 'closed');
      if (!regressive) {
        await this.repository.setTransactionStatus(
          transactionId,
          status,
          queried,
          transaction,
          providerMetadata,
        );
      }
      if (!paid && !regressive) {
        await this.repository.setIntentStatus(
          intentId,
          next,
          { closedAt: next === 'closed' ? new Date() : intent.closedAt },
          transaction,
        );
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action,
          resourceType: 'payment.intent',
          resourceId: intentId,
          metadata: { providerStatus: status },
        },
        transaction,
      );
    });
  }

  private validateCallback(
    intent: StoredIntent,
    transaction: Awaited<ReturnType<PaymentsRepository['latestTransaction']>>,
    callback: VerifiedPaymentCallback,
  ) {
    if (
      !transaction ||
      intent.amountMinor !== callback.amountMinor ||
      intent.currency !== callback.currency
    ) {
      throw new ApiError(400, 'PAYMENT_CALLBACK_AMOUNT_MISMATCH', '支付回调金额或币种不匹配');
    }
    if (
      intent.providerAppId !== callback.appId ||
      intent.providerMerchantId !== callback.merchantId
    ) {
      throw new ApiError(400, 'PAYMENT_CALLBACK_IDENTITY_MISMATCH', '支付回调应用或商户身份不匹配');
    }
  }

  private callbackIntentStatus(current: string, providerStatus: string): PaymentIntentStatus {
    if (['succeeded', 'partially_refunded', 'refunded'].includes(current)) {
      if (providerStatus !== 'succeeded')
        throw new ApiError(409, 'PAYMENT_CALLBACK_STATE_CONFLICT', '回调不能逆转已支付事实');
      return current as PaymentIntentStatus;
    }
    if (current === 'closed' && providerStatus !== 'closed') {
      throw new ApiError(409, 'PAYMENT_CALLBACK_STATE_CONFLICT', '回调与已关闭支付状态冲突');
    }
    return this.intentStatus(providerStatus);
  }

  private intentStatus(status: string): PaymentIntentStatus {
    return ['pending', 'succeeded', 'failed', 'closed', 'unknown'].includes(status)
      ? (status as PaymentIntentStatus)
      : 'unknown';
  }

  private provider(key: string): PaymentProviderAdapter {
    const provider = this.providers.get(key);
    if (!provider)
      throw new ApiError(400, 'PAYMENT_PROVIDER_UNSUPPORTED', '支付 Provider 不受支持');
    return provider;
  }

  private async getIntentRecord(id: string) {
    const intent = await this.repository.findIntent(id);
    if (!intent) throw new ApiError(404, 'PAYMENT_INTENT_NOT_FOUND', '支付意图不存在');
    return intent;
  }

  private async requireLockedIntent(id: string, transaction: DatabaseTransaction) {
    const intent = await this.repository.lockIntent(id, transaction);
    if (!intent) throw new ApiError(404, 'PAYMENT_INTENT_NOT_FOUND', '支付意图不存在');
    return intent;
  }

  private async requireTransaction(intentId: string) {
    const transaction = await this.repository.latestTransaction(intentId);
    if (!transaction)
      throw new ApiError(
        409,
        'PAYMENT_TRANSACTION_NOT_CREATED',
        'Provider 交易尚未创建，可稍后对账',
      );
    return transaction;
  }

  private assertSameIntent(intent: StoredIntent, input: CreatePaymentIntentRequest) {
    if (
      intent.provider !== (input.provider ?? 'mock') ||
      intent.amountMinor !== input.amountMinor ||
      intent.currency !== (input.currency ?? 'CNY') ||
      intent.description !== input.description
    )
      throw new ApiError(409, 'PAYMENT_INTENT_REFERENCE_CONFLICT', '业务支付引用已用于不同请求');
  }

  private intentView(intent: StoredIntent) {
    return {
      id: intent.id,
      merchantReference: intent.merchantReference,
      provider: intent.provider as 'mock' | 'wechat_pay',
      amountMinor: intent.amountMinor,
      refundedAmountMinor: intent.refundedAmountMinor,
      currency: intent.currency,
      description: intent.description,
      status: intent.status as PaymentIntentStatus,
      revision: intent.revision,
      paidAt: intent.paidAt?.toISOString() ?? null,
      closedAt: intent.closedAt?.toISOString() ?? null,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  }

  private async emitFact(intentId: string) {
    const intent = await this.getIntentRecord(intentId);
    if (
      !['succeeded', 'failed', 'closed', 'partially_refunded', 'refunded'].includes(intent.status)
    )
      return;
    await this.facts.receive({
      intentId: intent.id,
      merchantReference: intent.merchantReference,
      status: intent.status as
        'succeeded' | 'failed' | 'closed' | 'partially_refunded' | 'refunded',
      amountMinor: intent.amountMinor,
      refundedAmountMinor: intent.refundedAmountMinor,
      currency: intent.currency,
      occurredAt: intent.updatedAt,
    });
  }
}

function transactionView(
  record: NonNullable<Awaited<ReturnType<PaymentsRepository['latestTransaction']>>>,
) {
  return {
    id: record.id,
    intentId: record.intentId,
    provider: record.provider as 'mock' | 'wechat_pay',
    providerTransactionId: record.providerTransactionId,
    amountMinor: record.amountMinor,
    currency: record.currency,
    status: record.status as 'pending' | 'succeeded' | 'failed' | 'closed' | 'unknown',
    clientPayload: record.clientPayload ?? null,
    lastQueriedAt: record.lastQueriedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function refundView(record: StoredRefund): PaymentRefund {
  return {
    id: record.id,
    intentId: record.intentId,
    requestKey: record.requestKey,
    providerRefundId: record.providerRefundId,
    amountMinor: record.amountMinor,
    reason: record.reason,
    status: record.status as PaymentRefund['status'],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function callbackView(
  record: Awaited<ReturnType<PaymentsRepository['listCallbacks']>>['items'][number],
) {
  return {
    id: record.id,
    intentId: record.intentId,
    provider: record.provider as 'mock' | 'wechat_pay',
    providerEventId: record.providerEventId,
    providerTransactionId: record.providerTransactionId,
    eventType: record.eventType as 'payment.succeeded' | 'payment.failed' | 'payment.closed',
    amountMinor: record.amountMinor,
    currency: record.currency,
    payloadHash: record.payloadHash,
    receivedAt: record.receivedAt.toISOString(),
    processedAt: record.processedAt.toISOString(),
  };
}
