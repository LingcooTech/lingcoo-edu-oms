import { createDecipheriv, createHash, randomBytes, sign, verify } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { z } from 'zod';

import type { SettingsReader } from '../../settings/public.js';
import type {
  PaymentCallbackHeaders,
  PaymentProviderAdapter,
  PaymentProviderConfiguration,
  PaymentProviderCreateInput,
  PaymentProviderRefundResult,
  PaymentProviderTransactionResult,
  VerifiedPaymentCallback,
} from '../domain/model.js';
import { WechatPayV3Client } from './wechat-pay-v3.client.js';

const wechatNotificationSchema = z.object({
  id: z.string().trim().min(1).max(200),
  event_type: z.string().trim().min(1).max(100),
  resource_type: z.literal('encrypt-resource'),
  resource: z.object({
    algorithm: z.literal('AEAD_AES_256_GCM'),
    ciphertext: z.string().min(1),
    associated_data: z.string(),
    nonce: z.string().min(1),
  }),
});

const decryptedTransactionSchema = z.object({
  appid: z.string().trim().min(1).max(200),
  mchid: z.string().trim().min(1).max(200),
  out_trade_no: z.string().trim().min(1).max(200),
  transaction_id: z.string().trim().min(1).max(200),
  trade_state: z.enum(['SUCCESS', 'CLOSED', 'REVOKED', 'PAYERROR']),
  create_time: z.string().datetime().optional(),
  success_time: z.string().datetime().optional(),
  amount: z.object({
    total: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
});

type WechatTransaction = z.infer<typeof decryptedTransactionSchema>;

const callbackEventMap: Record<
  string,
  { eventType: VerifiedPaymentCallback['eventType']; state: WechatTransaction['trade_state'] }
> = {
  'TRANSACTION.SUCCESS': { eventType: 'payment.succeeded', state: 'SUCCESS' },
  'TRANSACTION.CLOSED': { eventType: 'payment.closed', state: 'CLOSED' },
  'TRANSACTION.REVOKED': { eventType: 'payment.closed', state: 'REVOKED' },
  'TRANSACTION.PAYERROR': { eventType: 'payment.failed', state: 'PAYERROR' },
};

export class WechatPayV3ProviderAdapter implements PaymentProviderAdapter {
  readonly key = 'wechat_pay' as const;

  constructor(
    settings: SettingsReader,
    private readonly client = new WechatPayV3Client(settings),
  ) {}

  async configuration(): Promise<PaymentProviderConfiguration> {
    const configuration = await this.client.configuration();
    return { appId: configuration.appId, merchantId: configuration.merchantId };
  }

  async create(input: PaymentProviderCreateInput): Promise<PaymentProviderTransactionResult> {
    const outTradeNo = input.merchantReference.trim();
    if (outTradeNo.length > 32) {
      throw new ApiError(
        400,
        'WECHAT_PAY_OUT_TRADE_NO_INVALID',
        '微信支付商户订单号不能超过 32 个字符',
      );
    }
    const payerOpenId = input.providerContext?.payerOpenId?.trim();
    if (!payerOpenId) {
      throw new ApiError(400, 'WECHAT_PAY_PAYER_OPEN_ID_REQUIRED', '微信支付需要付款人的 openid');
    }
    if (input.currency !== 'CNY') {
      throw new ApiError(400, 'WECHAT_PAY_CURRENCY_UNSUPPORTED', '微信支付 JSAPI 仅支持人民币');
    }
    const configuration = await this.client.configuration();
    const response = await this.client.createJsapiTransaction({
      description: input.description,
      outTradeNo,
      amountMinor: input.amountMinor,
      currency: input.currency,
      payerOpenId,
    });
    if (!response.prepay_id?.trim()) {
      throw new ApiError(502, 'WECHAT_PAY_PREPAY_ID_MISSING', '微信支付未返回预支付交易会话标识');
    }

    const timeStamp = Math.floor(Date.now() / 1_000).toString();
    const nonceStr = randomBytes(16).toString('hex');
    const packageValue = `prepay_id=${response.prepay_id}`;
    const paySign = sign(
      'RSA-SHA256',
      Buffer.from(`${configuration.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`),
      configuration.merchantPrivateKey,
    ).toString('base64');

    return {
      providerTransactionId: outTradeNo,
      status: 'pending',
      clientPayload: {
        timeStamp,
        nonceStr,
        package: packageValue,
        signType: 'RSA',
        paySign,
      },
    };
  }

  async close(providerTransactionId: string): Promise<PaymentProviderTransactionResult> {
    await this.client.closeTransaction(providerTransactionId);
    return { providerTransactionId, status: 'closed' };
  }

  async query(providerTransactionId: string): Promise<PaymentProviderTransactionResult> {
    const response = await this.client.queryTransaction(providerTransactionId);
    if (response.out_trade_no && response.out_trade_no !== providerTransactionId) {
      throw new ApiError(
        502,
        'WECHAT_PAY_TRANSACTION_REFERENCE_MISMATCH',
        '微信支付交易引用不匹配',
      );
    }
    return {
      providerTransactionId,
      status: transactionStatus(response.trade_state),
      providerMetadata: response.transaction_id
        ? { transactionId: response.transaction_id }
        : undefined,
    };
  }

  async refund(input: {
    providerTransactionId: string;
    refundId: string;
    amountMinor: number;
    totalAmountMinor: number;
    currency: string;
    reason: string;
  }): Promise<PaymentProviderRefundResult> {
    const response = await this.client.refundTransaction({
      outTradeNo: input.providerTransactionId,
      refundId: input.refundId,
      amountMinor: input.amountMinor,
      totalAmountMinor: input.totalAmountMinor,
      currency: input.currency,
      reason: input.reason,
    });
    return {
      providerRefundId: response.refund_id ?? input.refundId,
      status: refundStatus(response.status),
    };
  }

  async queryRefund(refundId: string): Promise<PaymentProviderRefundResult> {
    const response = await this.client.queryRefund(refundId);
    return {
      providerRefundId: response.refund_id ?? refundId,
      status: refundStatus(response.status),
    };
  }

  async verifyCallback(
    _input: unknown,
    _signature: string | undefined,
    rawBody: Buffer,
    headers: PaymentCallbackHeaders = {},
  ): Promise<VerifiedPaymentCallback> {
    const configuration = await this.client.configuration();
    const timestamp = header(headers, 'wechatpay-timestamp');
    const nonce = header(headers, 'wechatpay-nonce');
    const signature = header(headers, 'wechatpay-signature');
    const serial = header(headers, 'wechatpay-serial');
    if (!timestamp || !nonce || !signature || !serial) {
      throw new ApiError(401, 'WECHAT_PAY_CALLBACK_HEADERS_MISSING', '微信支付回调验签头不完整');
    }
    const timestampNumber = Number(timestamp);
    const age = Math.abs(Date.now() / 1_000 - timestampNumber);
    if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(timestampNumber) || age > 300) {
      throw new ApiError(401, 'WECHAT_PAY_CALLBACK_EXPIRED', '微信支付回调已超出允许时间窗口');
    }
    if (serial !== configuration.publicKeyId) {
      throw new ApiError(401, 'WECHAT_PAY_CALLBACK_KEY_MISMATCH', '微信支付回调证书序列号不匹配');
    }
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`),
      configuration.publicKey,
      decodeBase64(signature),
    );
    if (!valid)
      throw new ApiError(401, 'WECHAT_PAY_CALLBACK_SIGNATURE_INVALID', '微信支付回调验签失败');

    const notification = parseNotification(rawBody);
    const decrypted = decryptResource(notification.resource, configuration.apiV3Key);
    const transaction = parseTransaction(decrypted);
    const expected = callbackEventMap[notification.event_type];
    if (!expected || expected.state !== transaction.trade_state) {
      throw new ApiError(400, 'WECHAT_PAY_CALLBACK_EVENT_INVALID', '微信支付回调事件无效');
    }
    if (
      transaction.appid !== configuration.appId ||
      transaction.mchid !== configuration.merchantId
    ) {
      throw new ApiError(
        400,
        'WECHAT_PAY_CALLBACK_IDENTITY_MISMATCH',
        '微信支付回调应用或商户身份不匹配',
      );
    }
    if (transaction.amount.currency !== 'CNY') {
      throw new ApiError(400, 'WECHAT_PAY_CALLBACK_CURRENCY_INVALID', '微信支付回调币种无效');
    }
    const occurredAt = transaction.success_time ?? transaction.create_time;
    if (!occurredAt) {
      throw new ApiError(400, 'WECHAT_PAY_CALLBACK_TIME_MISSING', '微信支付回调缺少交易时间');
    }
    return {
      providerEventId: notification.id,
      providerTransactionId: transaction.out_trade_no,
      appId: transaction.appid,
      merchantId: transaction.mchid,
      eventType: expected.eventType,
      amountMinor: transaction.amount.total,
      currency: transaction.amount.currency,
      occurredAt,
      provider: 'wechat_pay',
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
      providerMetadata: { transactionId: transaction.transaction_id },
    };
  }
}

function transactionStatus(
  state: string | undefined,
): 'pending' | 'succeeded' | 'failed' | 'closed' | 'unknown' {
  if (state === 'SUCCESS') return 'succeeded';
  if (state === 'CLOSED' || state === 'REVOKED') return 'closed';
  if (state === 'PAYERROR') return 'failed';
  if (state === 'NOTPAY' || state === 'USERPAYING') return 'pending';
  return 'unknown';
}

function refundStatus(status: string | undefined): 'succeeded' | 'pending' | 'unknown' {
  if (status === 'SUCCESS') return 'succeeded';
  if (status === 'PROCESSING') return 'pending';
  return 'unknown';
}

function header(headers: PaymentCallbackHeaders, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function decodeBase64(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ApiError(401, 'WECHAT_PAY_CALLBACK_SIGNATURE_INVALID', '微信支付回调验签失败');
  }
  return Buffer.from(value, 'base64');
}

function parseNotification(rawBody: Buffer) {
  try {
    const result = wechatNotificationSchema.safeParse(JSON.parse(rawBody.toString('utf8')));
    if (!result.success) throw new Error('invalid notification');
    return result.data;
  } catch {
    throw new ApiError(400, 'WECHAT_PAY_CALLBACK_PAYLOAD_INVALID', '微信支付回调数据无效');
  }
}

function decryptResource(
  resource: z.infer<typeof wechatNotificationSchema>['resource'],
  apiV3Key: string,
): unknown {
  try {
    const ciphertext = Buffer.from(resource.ciphertext, 'base64');
    if (ciphertext.length <= 16) throw new Error('invalid ciphertext');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key, 'utf8'),
      Buffer.from(resource.nonce, 'utf8'),
    );
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    const plaintext = Buffer.concat([
      decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    return parsed;
  } catch {
    throw new ApiError(400, 'WECHAT_PAY_CALLBACK_DECRYPT_FAILED', '微信支付回调解密失败');
  }
}

function parseTransaction(input: unknown): WechatTransaction {
  const result = decryptedTransactionSchema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'WECHAT_PAY_CALLBACK_TRANSACTION_INVALID', '微信支付交易数据无效');
  }
  return result.data;
}
