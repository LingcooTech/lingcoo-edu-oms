import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { mockPaymentCallbackRequestSchema } from '@lingcoo-edu-oms/contracts';

import type { SettingsReader } from '../../settings/public.js';
import type {
  PaymentProviderAdapter,
  PaymentProviderConfiguration,
  VerifiedPaymentCallback,
} from '../domain/model.js';

export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly key = 'mock' as const;

  constructor(private readonly settings: SettingsReader) {}

  async configuration(): Promise<PaymentProviderConfiguration> {
    return {
      appId: (await this.settings.getValue<string>('payments.mock.app-id')) ?? 'mock-app',
      merchantId:
        (await this.settings.getValue<string>('payments.mock.merchant-id')) ?? 'mock-merchant',
      signingSecret: await this.settings.getValue<string>('payments.mock.signing-secret'),
    };
  }

  async create(input: { intentId: string }) {
    return { providerTransactionId: `mock_txn_${input.intentId}`, status: 'pending' as const };
  }

  async close(providerTransactionId: string) {
    return { providerTransactionId, status: 'closed' as const };
  }

  async query(providerTransactionId: string) {
    return { providerTransactionId, status: 'pending' as const };
  }

  async refund(input: { refundId: string }) {
    return { providerRefundId: `mock_refund_${input.refundId}`, status: 'succeeded' as const };
  }

  async verifyCallback(
    input: unknown,
    signature: string | undefined,
    rawBody: Buffer,
  ): Promise<VerifiedPaymentCallback> {
    const payload = mockPaymentCallbackRequestSchema.parse(input);
    const configuration = await this.configuration();
    if (!configuration.signingSecret) {
      throw new ApiError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', '支付回调签名密钥尚未配置');
    }
    if (payload.appId !== configuration.appId || payload.merchantId !== configuration.merchantId) {
      throw new ApiError(400, 'PAYMENT_CALLBACK_IDENTITY_MISMATCH', '支付回调应用或商户身份不匹配');
    }
    const expected = createHmac('sha256', configuration.signingSecret)
      .update(rawBody)
      .digest('hex');
    const received = signature?.trim().toLowerCase() ?? '';
    const valid =
      /^[a-f0-9]{64}$/.test(received) &&
      timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) throw new ApiError(401, 'PAYMENT_CALLBACK_SIGNATURE_INVALID', '支付回调签名无效');
    return {
      ...payload,
      provider: 'mock',
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
    };
  }
}
