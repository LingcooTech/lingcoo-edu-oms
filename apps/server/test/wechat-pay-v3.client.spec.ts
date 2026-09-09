import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { SettingsReader } from '../src/modules/settings/public.js';
import { WechatPayV3Client } from '../src/modules/payments/infrastructure/wechat-pay-v3.client.js';

function settings(values: Record<string, unknown>): SettingsReader {
  return {
    async getValue<T>(key: string) {
      return values[key] as T | undefined;
    },
    async publicValues() {
      return {};
    },
  };
}

function keys() {
  const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platform = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    merchantPrivateKey: merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    platformPrivateKey: platform.privateKey,
    platformPublicKey: platform.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

describe('WeChat Pay APIv3 client', () => {
  it('signs the request and verifies the WeChat Pay response', async () => {
    const material = keys();
    const responseBody = JSON.stringify({ data: [] });
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const nonce = 'response-nonce';
    const responseSignature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${responseBody}\n`),
      material.platformPrivateKey,
    ).toString('base64');
    const request = vi.fn<typeof fetch>();
    request.mockResolvedValue(
      new Response(responseBody, {
        status: 200,
        headers: {
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': nonce,
          'wechatpay-signature': responseSignature,
          'wechatpay-serial': 'PUB_KEY_ID_123456',
        },
      }),
    );
    const client = new WechatPayV3Client(
      settings({
        'wechat-pay.app-id': 'wx1234567890abcdef',
        'wechat-pay.merchant-id': '1900000109',
        'wechat-pay.merchant-serial-number': 'MERCHANT_SERIAL_123',
        'wechat-pay.merchant-private-key': material.merchantPrivateKey,
        'wechat-pay.api-v3-key': '12345678901234567890123456789012',
        'wechat-pay.public-key-id': 'PUB_KEY_ID_123456',
        'wechat-pay.public-key': material.platformPublicKey,
        'wechat-pay.notify-url': 'https://example.com/api/payments/wechat/callback',
      }),
      request as typeof fetch,
    );

    await client.testConnection(new AbortController().signal);

    const init = request.mock.calls[0]?.[1];
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toMatch(/^WECHATPAY2-SHA256-RSA2048 /);
  });

  it('rejects an unsigned response', async () => {
    const material = keys();
    const client = new WechatPayV3Client(
      settings({
        'wechat-pay.app-id': 'wx1234567890abcdef',
        'wechat-pay.merchant-id': '1900000109',
        'wechat-pay.merchant-serial-number': 'MERCHANT_SERIAL_123',
        'wechat-pay.merchant-private-key': material.merchantPrivateKey,
        'wechat-pay.api-v3-key': '12345678901234567890123456789012',
        'wechat-pay.public-key-id': 'PUB_KEY_ID_123456',
        'wechat-pay.public-key': material.platformPublicKey,
        'wechat-pay.notify-url': 'https://example.com/api/payments/wechat/callback',
      }),
      vi.fn(async () => Response.json({ data: [] })) as typeof fetch,
    );

    await expect(client.testConnection(new AbortController().signal)).rejects.toMatchObject({
      code: 'WECHAT_PAY_RESPONSE_SIGNATURE_MISSING',
    });
  });
});
