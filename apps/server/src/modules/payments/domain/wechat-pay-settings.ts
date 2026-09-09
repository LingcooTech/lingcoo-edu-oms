import { z } from 'zod';

import type { SettingDefinition } from '../../settings/public.js';

const pemSchema = z
  .string()
  .trim()
  .min(100)
  .max(20_000)
  .refine((value) => value.includes('-----BEGIN'), '请输入 PEM 格式密钥');

export const WECHAT_PAY_SETTINGS: SettingDefinition[] = [
  {
    key: 'wechat-pay.enabled',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '启用微信支付',
    description: '仅控制 Provider 可用性；不会自动创建订单或发放课时。',
    kind: 'internal',
    schema: z.boolean(),
    environment: 'WECHAT_PAY_ENABLED',
    defaultValue: false,
    control: 'boolean',
  },
  {
    key: 'wechat-pay.app-id',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '支付 AppID',
    description: '与微信支付商户号绑定、用于小程序支付的 AppID。',
    kind: 'internal',
    schema: z
      .string()
      .trim()
      .regex(/^wx[0-9a-fA-F]{16}$/),
    environment: 'WECHAT_PAY_APP_ID',
    control: 'text',
  },
  {
    key: 'wechat-pay.merchant-id',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '微信支付商户号',
    description: '微信支付分配的普通商户号。',
    kind: 'internal',
    schema: z
      .string()
      .trim()
      .regex(/^\d{6,32}$/),
    environment: 'WECHAT_PAY_MERCHANT_ID',
    control: 'text',
  },
  {
    key: 'wechat-pay.merchant-serial-number',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '商户 API 证书序列号',
    description: '与商户 API 证书私钥配套使用的证书序列号。',
    kind: 'internal',
    schema: z.string().trim().min(8).max(128),
    environment: 'WECHAT_PAY_MERCHANT_SERIAL_NUMBER',
    control: 'text',
  },
  {
    key: 'wechat-pay.merchant-private-key',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '商户 API 证书私钥',
    description: 'PEM 格式，仅用于 APIv3 请求签名；加密保存且永不回显。',
    kind: 'secret',
    schema: pemSchema,
    environment: 'WECHAT_PAY_MERCHANT_PRIVATE_KEY',
    control: 'textarea',
  },
  {
    key: 'wechat-pay.api-v3-key',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: 'APIv3 密钥',
    description: '32 字节 APIv3 密钥，用于解密支付回调；加密保存且永不回显。',
    kind: 'secret',
    schema: z.string().refine((value) => Buffer.byteLength(value, 'utf8') === 32, '必须为 32 字节'),
    environment: 'WECHAT_PAY_API_V3_KEY',
    control: 'text',
  },
  {
    key: 'wechat-pay.public-key-id',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '微信支付公钥 ID',
    description: '微信支付公钥模式下的平台公钥 ID，用于响应与回调验签。',
    kind: 'internal',
    schema: z.string().trim().min(8).max(128),
    environment: 'WECHAT_PAY_PUBLIC_KEY_ID',
    control: 'text',
  },
  {
    key: 'wechat-pay.public-key',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '微信支付公钥',
    description: 'PEM 格式平台公钥，用于响应与回调验签；按敏感配置保护。',
    kind: 'secret',
    schema: pemSchema,
    environment: 'WECHAT_PAY_PUBLIC_KEY',
    control: 'textarea',
  },
  {
    key: 'wechat-pay.notify-url',
    group: 'wechat-pay',
    groupLabel: '微信支付',
    groupOrder: 70,
    label: '支付回调地址',
    description: '必须是公网可访问的 HTTPS 地址；订单模块接入时作为 notify_url。',
    kind: 'internal',
    schema: z.url().refine((value) => value.startsWith('https://'), '必须使用 HTTPS'),
    environment: 'WECHAT_PAY_NOTIFY_URL',
    control: 'url',
  },
];
