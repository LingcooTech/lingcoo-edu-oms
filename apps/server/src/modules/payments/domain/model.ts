import type {
  MockPaymentCallbackRequest,
  PaymentCallbackEvent,
  PaymentClientPayload,
  PaymentProvider,
  PaymentTransactionStatus,
} from '@lingcoo-edu-oms/contracts';

export interface PaymentProviderConfiguration {
  appId: string;
  merchantId: string;
  signingSecret?: string;
}

export interface PaymentProviderCreateInput {
  intentId: string;
  merchantReference: string;
  amountMinor: number;
  currency: string;
  description: string;
  providerContext?: {
    payerOpenId?: string;
  };
}

export interface PaymentProviderTransactionResult {
  providerTransactionId: string;
  status: PaymentTransactionStatus;
  clientPayload?: PaymentClientPayload;
  providerMetadata?: Record<string, unknown>;
}

export interface PaymentProviderRefundResult {
  providerRefundId: string;
  status: 'succeeded' | 'pending' | 'unknown';
}

export interface VerifiedPaymentCallback extends MockPaymentCallbackRequest {
  provider: PaymentProvider;
  payloadHash: string;
  providerMetadata?: Record<string, unknown>;
}

export type PaymentCallbackHeaders = Readonly<Record<string, string | undefined>>;

export interface PaymentProviderAdapter {
  readonly key: PaymentProvider;
  configuration(): Promise<PaymentProviderConfiguration>;
  create(input: PaymentProviderCreateInput): Promise<PaymentProviderTransactionResult>;
  close(providerTransactionId: string): Promise<PaymentProviderTransactionResult>;
  query(providerTransactionId: string): Promise<PaymentProviderTransactionResult>;
  refund(input: {
    providerTransactionId: string;
    refundId: string;
    amountMinor: number;
    totalAmountMinor: number;
    currency: string;
    reason: string;
  }): Promise<PaymentProviderRefundResult>;
  verifyCallback(
    input: unknown,
    signature: string | undefined,
    rawBody: Buffer,
    headers?: PaymentCallbackHeaders,
  ): Promise<VerifiedPaymentCallback>;
}

export interface PaymentFact {
  intentId: string;
  merchantReference: string;
  status: 'succeeded' | 'failed' | 'closed' | 'partially_refunded' | 'refunded';
  amountMinor: number;
  refundedAmountMinor: number;
  currency: string;
  occurredAt: Date;
}

export interface PaymentFactReceiver {
  receive(fact: PaymentFact): Promise<void>;
  assertRefundAllowed?(request: {
    intentId: string;
    merchantReference: string;
    amountMinor: number;
    reason: string;
  }): Promise<void>;
}

export const NOOP_PAYMENT_FACT_RECEIVER: PaymentFactReceiver = { async receive() {} };

export function callbackStatus(event: PaymentCallbackEvent): PaymentTransactionStatus {
  if (event === 'payment.succeeded') return 'succeeded';
  if (event === 'payment.failed') return 'failed';
  return 'closed';
}
