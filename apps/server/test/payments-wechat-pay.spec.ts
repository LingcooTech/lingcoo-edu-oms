import { createCipheriv, generateKeyPairSync, sign, verify } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { SettingsReader } from '../src/modules/settings/public.js';
import { WechatPayV3ProviderAdapter } from '../src/modules/payments/public.js';
import { WechatPayV3Client } from '../src/modules/payments/infrastructure/wechat-pay-v3.client.js';

function keys() {
  const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platform = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    merchantPrivateKey: merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    merchantPublicKey: merchant.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    platformPrivateKey: platform.privateKey,
    platformPublicKey: platform.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function settings(material: ReturnType<typeof keys>): SettingsReader {
  return {
    async getValue<T>(key: string) {
      return (
        {
          'wechat-pay.app-id': 'wx1234567890abcdef',
          'wechat-pay.merchant-id': '1900000109',
          'wechat-pay.merchant-serial-number': 'MERCHANT_SERIAL_123',
          'wechat-pay.merchant-private-key': material.merchantPrivateKey,
          'wechat-pay.api-v3-key': '12345678901234567890123456789012',
          'wechat-pay.public-key-id': 'PUB_KEY_ID_123456',
          'wechat-pay.public-key': material.platformPublicKey,
          'wechat-pay.notify-url': 'https://example.com/api/payments/providers/wechat-pay/callback',
        } as Record<string, unknown>
      )[key] as T | undefined;
    },
    async publicValues() {
      return {};
    },
  };
}

function signedResponse(body: string, material: ReturnType<typeof keys>, status = 200) {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const nonce = 'response-nonce';
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
    material.platformPrivateKey,
  ).toString('base64');
  return new Response(status === 204 ? null : body, {
    status,
    headers: {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': 'PUB_KEY_ID_123456',
    },
  });
}

describe('WeChat Pay APIv3 provider', () => {
  it('creates JSAPI orders and returns verifiable wx.requestPayment parameters', async () => {
    const material = keys();
    const requests: Array<{ path: string; body: string }> = [];
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input.toString());
      requests.push({ path: `${url.pathname}${url.search}`, body: String(init?.body ?? '') });
      return signedResponse(JSON.stringify({ prepay_id: 'wx_prepay_123' }), material);
    });
    const provider = new WechatPayV3ProviderAdapter(
      settings(material),
      new WechatPayV3Client(settings(material), request),
    );

    const result = await provider.create({
      intentId: 'intent-1',
      merchantReference: 'order-20260911-001',
      amountMinor: 1_999,
      currency: 'CNY',
      description: '通用课时包',
      providerContext: { payerOpenId: 'o_payer_open_id' },
    });

    expect(requests[0]).toMatchObject({ path: '/v3/pay/transactions/jsapi' });
    expect(JSON.parse(requests[0]!.body)).toMatchObject({
      appid: 'wx1234567890abcdef',
      mchid: '1900000109',
      out_trade_no: 'order-20260911-001',
      amount: { total: 1_999, currency: 'CNY' },
      payer: { openid: 'o_payer_open_id' },
    });
    expect(result).toMatchObject({
      providerTransactionId: 'order-20260911-001',
      status: 'pending',
      clientPayload: {
        package: 'prepay_id=wx_prepay_123',
        signType: 'RSA',
      },
    });
    const payload = result.clientPayload!;
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(
          `wx1234567890abcdef\n${payload.timeStamp}\n${payload.nonceStr}\n${payload.package}\n`,
        ),
        material.merchantPublicKey,
        Buffer.from(payload.paySign!, 'base64'),
      ),
    ).toBe(true);
  });

  it('uses out_trade_no for query, close, and refund', async () => {
    const material = keys();
    const requests: Array<{ path: string; body: string }> = [];
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input.toString());
      const path = `${url.pathname}${url.search}`;
      requests.push({ path, body: String(init?.body ?? '') });
      if (url.pathname === '/v3/pay/transactions/out-trade-no/order-1') {
        return signedResponse(
          JSON.stringify({
            out_trade_no: 'order-1',
            trade_state: 'SUCCESS',
            transaction_id: 'wx-tx-1',
          }),
          material,
        );
      }
      if (url.pathname.endsWith('/close')) return signedResponse('', material, 204);
      return signedResponse(
        JSON.stringify({ refund_id: 'wx-refund-1', status: 'SUCCESS' }),
        material,
      );
    });
    const client = new WechatPayV3Client(settings(material), request);
    const provider = new WechatPayV3ProviderAdapter(settings(material), client);

    await expect(provider.query('order-1')).resolves.toMatchObject({
      providerTransactionId: 'order-1',
      status: 'succeeded',
      providerMetadata: { transactionId: 'wx-tx-1' },
    });
    await expect(provider.close('order-1')).resolves.toMatchObject({
      providerTransactionId: 'order-1',
      status: 'closed',
    });
    await expect(
      provider.refund({
        providerTransactionId: 'order-1',
        refundId: 'refund-1',
        amountMinor: 500,
        totalAmountMinor: 1_000,
        currency: 'CNY',
        reason: '测试退款',
      }),
    ).resolves.toMatchObject({ providerRefundId: 'wx-refund-1', status: 'succeeded' });

    expect(requests.map((item) => item.path)).toEqual([
      '/v3/pay/transactions/out-trade-no/order-1?mchid=1900000109',
      '/v3/pay/transactions/out-trade-no/order-1/close',
      '/v3/refund/domestic/refunds',
    ]);
    expect(JSON.parse(requests[2]!.body)).toMatchObject({
      out_trade_no: 'order-1',
      out_refund_no: 'refund-1',
      amount: { refund: 500, total: 1_000, currency: 'CNY' },
    });
  });

  it('verifies and decrypts signed callbacks, retaining transaction_id only as metadata', async () => {
    const material = keys();
    const provider = new WechatPayV3ProviderAdapter(settings(material));
    const rawBody = encryptedCallback({
      event_type: 'TRANSACTION.SUCCESS',
      transaction_id: 'wx-real-transaction-id',
      trade_state: 'SUCCESS',
    });
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const nonce = 'callback-nonce';
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${rawBody.toString('utf8')}\n`),
      material.platformPrivateKey,
    ).toString('base64');

    await expect(
      provider.verifyCallback({}, undefined, rawBody, {
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signature,
        'wechatpay-serial': 'PUB_KEY_ID_123456',
      }),
    ).resolves.toMatchObject({
      provider: 'wechat_pay',
      providerEventId: 'notification-1',
      providerTransactionId: 'order-1',
      appId: 'wx1234567890abcdef',
      merchantId: '1900000109',
      eventType: 'payment.succeeded',
      amountMinor: 1_000,
      currency: 'CNY',
      providerMetadata: { transactionId: 'wx-real-transaction-id' },
    });
  });

  it('rejects tampered and expired callbacks without exposing callback plaintext', async () => {
    const material = keys();
    const provider = new WechatPayV3ProviderAdapter(settings(material));
    const body = encryptedCallback({
      event_type: 'TRANSACTION.SUCCESS',
      transaction_id: 'secret-transaction-id',
      trade_state: 'SUCCESS',
    });
    const nonce = 'callback-nonce';
    const signBody = (timestamp: string, value: Buffer) =>
      sign(
        'RSA-SHA256',
        Buffer.from(`${timestamp}\n${nonce}\n${value.toString('utf8')}\n`),
        material.platformPrivateKey,
      ).toString('base64');

    const tampered = Buffer.from(body.toString('utf8').replace('notification-1', 'notification-2'));
    await expect(
      provider.verifyCallback({}, undefined, tampered, {
        'wechatpay-timestamp': Math.floor(Date.now() / 1_000).toString(),
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signBody(Math.floor(Date.now() / 1_000).toString(), body),
        'wechatpay-serial': 'PUB_KEY_ID_123456',
      }),
    ).rejects.toMatchObject({ code: 'WECHAT_PAY_CALLBACK_SIGNATURE_INVALID' });

    const expired = (Math.floor(Date.now() / 1_000) - 301).toString();
    await expect(
      provider.verifyCallback({}, undefined, body, {
        'wechatpay-timestamp': expired,
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signBody(expired, body),
        'wechatpay-serial': 'PUB_KEY_ID_123456',
      }),
    ).rejects.toMatchObject({ code: 'WECHAT_PAY_CALLBACK_EXPIRED' });
    try {
      await provider.verifyCallback({}, undefined, tampered, {
        'wechatpay-timestamp': Math.floor(Date.now() / 1_000).toString(),
        'wechatpay-nonce': nonce,
        'wechatpay-signature': 'invalid',
        'wechatpay-serial': 'PUB_KEY_ID_123456',
      });
    } catch (error) {
      expect(String(error)).not.toContain('secret-transaction-id');
      expect(String(error)).not.toContain('12345678901234567890123456789012');
    }
  });
});

function encryptedCallback(overrides: {
  event_type: string;
  transaction_id: string;
  trade_state: string;
}) {
  const plaintext = JSON.stringify({
    appid: 'wx1234567890abcdef',
    mchid: '1900000109',
    out_trade_no: 'order-1',
    transaction_id: overrides.transaction_id,
    trade_state: overrides.trade_state,
    create_time: '2026-09-11T02:00:00.000Z',
    success_time: '2026-09-11T02:00:01.000Z',
    amount: { total: 1_000, currency: 'CNY' },
  });
  const nonce = '123456789012';
  const associatedData = 'associated-data';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from('12345678901234567890123456789012'),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const resource = {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64'),
    associated_data: associatedData,
    nonce,
  };
  return Buffer.from(
    JSON.stringify({
      id: 'notification-1',
      event_type: overrides.event_type,
      resource_type: 'encrypt-resource',
      resource,
    }),
  );
}
