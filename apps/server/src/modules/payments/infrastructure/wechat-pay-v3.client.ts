import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';

import type { SettingsReader } from '../../settings/public.js';

interface WechatPayConfiguration {
  appId: string;
  merchantId: string;
  merchantSerialNumber: string;
  merchantPrivateKey: string;
  apiV3Key: string;
  publicKeyId: string;
  publicKey: string;
  notifyUrl: string;
}

export class WechatPayV3Client {
  constructor(
    private readonly settings: SettingsReader,
    private readonly request: typeof fetch = fetch,
    private readonly baseUrl = 'https://api.mch.weixin.qq.com',
  ) {}

  async configuration(): Promise<WechatPayConfiguration> {
    const keys = [
      'app-id',
      'merchant-id',
      'merchant-serial-number',
      'merchant-private-key',
      'api-v3-key',
      'public-key-id',
      'public-key',
      'notify-url',
    ] as const;
    const values = await Promise.all(
      keys.map((key) => this.settings.getValue<string>(`wechat-pay.${key}`)),
    );
    if (values.some((value) => !value)) {
      throw new ApiError(503, 'WECHAT_PAY_NOT_CONFIGURED', '微信支付 APIv3 配置不完整');
    }
    const [
      appId,
      merchantId,
      merchantSerialNumber,
      merchantPrivateKey,
      apiV3Key,
      publicKeyId,
      publicKey,
      notifyUrl,
    ] = values as [string, string, string, string, string, string, string, string];
    try {
      createPrivateKey(merchantPrivateKey);
      createPublicKey(publicKey);
    } catch {
      throw new ApiError(400, 'WECHAT_PAY_KEY_INVALID', '微信支付 PEM 密钥格式无效');
    }
    if (Buffer.byteLength(apiV3Key, 'utf8') !== 32) {
      throw new ApiError(400, 'WECHAT_PAY_API_V3_KEY_INVALID', '微信支付 APIv3 密钥必须为 32 字节');
    }
    return {
      appId,
      merchantId,
      merchantSerialNumber,
      merchantPrivateKey,
      apiV3Key,
      publicKeyId,
      publicKey,
      notifyUrl,
    };
  }

  async testConnection(signal: AbortSignal): Promise<void> {
    await this.call('GET', '/v3/certificates', undefined, signal);
  }

  async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const configuration = await this.configuration();
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const nonce = randomBytes(16).toString('hex');
    const payload = body === undefined ? '' : JSON.stringify(body);
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${payload}\n`;
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(message),
      configuration.merchantPrivateKey,
    ).toString('base64');
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${configuration.merchantId}",` +
      `nonce_str="${nonce}",timestamp="${timestamp}",` +
      `serial_no="${configuration.merchantSerialNumber}",signature="${signature}"`;
    const response = await this.request(new URL(path, this.baseUrl), {
      method,
      headers: {
        accept: 'application/json',
        authorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : payload,
      signal,
    });
    const responseBody = await response.text();
    if (!response.ok) {
      throw new ApiError(502, 'WECHAT_PAY_UPSTREAM_ERROR', '微信支付接口请求失败', {
        status: response.status,
      });
    }
    this.verifyResponse(response.headers, responseBody, configuration);
    return (responseBody ? JSON.parse(responseBody) : {}) as T;
  }

  private verifyResponse(
    headers: Headers,
    body: string,
    configuration: WechatPayConfiguration,
  ): void {
    const timestamp = headers.get('wechatpay-timestamp');
    const nonce = headers.get('wechatpay-nonce');
    const signature = headers.get('wechatpay-signature');
    const serial = headers.get('wechatpay-serial');
    if (!timestamp || !nonce || !signature || !serial) {
      throw new ApiError(502, 'WECHAT_PAY_RESPONSE_SIGNATURE_MISSING', '微信支付响应缺少验签头');
    }
    if (serial !== configuration.publicKeyId) {
      throw new ApiError(502, 'WECHAT_PAY_RESPONSE_KEY_MISMATCH', '微信支付响应公钥 ID 不匹配');
    }
    const age = Math.abs(Date.now() / 1_000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) {
      throw new ApiError(502, 'WECHAT_PAY_RESPONSE_EXPIRED', '微信支付响应时间戳超出允许范围');
    }
    const message = `${timestamp}\n${nonce}\n${body}\n`;
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(message),
      configuration.publicKey,
      Buffer.from(signature, 'base64'),
    );
    if (!valid) {
      throw new ApiError(502, 'WECHAT_PAY_RESPONSE_SIGNATURE_INVALID', '微信支付响应验签失败');
    }
  }
}

export function createWechatPayConnectionTester(settings: SettingsReader) {
  const client = new WechatPayV3Client(settings);
  return {
    key: 'wechat-pay.connection',
    group: 'wechat-pay',
    label: '测试微信支付连接',
    description: '发送签名 APIv3 请求并验证微信支付响应签名，不创建真实交易。',
    requiredSettings: [
      'wechat-pay.app-id',
      'wechat-pay.merchant-id',
      'wechat-pay.merchant-serial-number',
      'wechat-pay.merchant-private-key',
      'wechat-pay.api-v3-key',
      'wechat-pay.public-key-id',
      'wechat-pay.public-key',
      'wechat-pay.notify-url',
    ],
    timeoutMs: 10_000,
    async test(_values: ReadonlyMap<string, unknown>, signal: AbortSignal) {
      await client.testConnection(signal);
      return { ok: true, message: '微信支付 APIv3 签名、连接与响应验签正常' };
    },
  };
}
