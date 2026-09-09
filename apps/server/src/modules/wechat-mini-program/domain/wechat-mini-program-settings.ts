import { z } from 'zod';

import type { SettingDefinition } from '../../settings/public.js';

const appIdSchema = z
  .string()
  .trim()
  .regex(/^wx[0-9a-fA-F]{16}$/, '请输入有效的小程序 AppID');
const optionalTemplateIdSchema = z.string().trim().max(200);

export const WECHAT_MINI_PROGRAM_SETTINGS: SettingDefinition[] = [
  {
    key: 'wechat-mini-program.enabled',
    group: 'wechat-mini-program',
    groupLabel: '微信小程序',
    groupOrder: 60,
    label: '启用微信小程序接口',
    description: '启用后，服务端才允许调用登录凭证、手机号和订阅消息接口。',
    kind: 'internal',
    schema: z.boolean(),
    environment: 'WECHAT_MINI_PROGRAM_ENABLED',
    defaultValue: false,
    control: 'boolean',
  },
  {
    key: 'wechat-mini-program.app-id',
    group: 'wechat-mini-program',
    groupLabel: '微信小程序',
    groupOrder: 60,
    label: '小程序 AppID',
    description: '微信公众平台分配的小程序应用标识。',
    kind: 'internal',
    schema: appIdSchema,
    environment: 'WECHAT_MINI_PROGRAM_APP_ID',
    control: 'text',
  },
  {
    key: 'wechat-mini-program.app-secret',
    group: 'wechat-mini-program',
    groupLabel: '微信小程序',
    groupOrder: 60,
    label: '小程序 AppSecret',
    description: '仅服务端使用，加密保存且不会通过接口或管理后台回显。',
    kind: 'secret',
    schema: z.string().trim().min(16).max(200),
    environment: 'WECHAT_MINI_PROGRAM_APP_SECRET',
    control: 'text',
  },
  {
    key: 'wechat-mini-program.state',
    group: 'wechat-mini-program',
    groupLabel: '微信小程序',
    groupOrder: 60,
    label: '消息跳转版本',
    description: '订阅消息点击后进入开发版、体验版或正式版小程序。',
    kind: 'internal',
    schema: z.enum(['developer', 'trial', 'formal']),
    environment: 'WECHAT_MINI_PROGRAM_STATE',
    defaultValue: 'formal',
    control: 'select',
    options: [
      { label: '开发版', value: 'developer' },
      { label: '体验版', value: 'trial' },
      { label: '正式版', value: 'formal' },
    ],
  },
  {
    key: 'wechat-mini-program.session-reminder-template-id',
    group: 'wechat-mini-program',
    groupLabel: '微信小程序',
    groupOrder: 60,
    label: '课次提醒模板 ID',
    description: '用于课前提醒；未启用对应通知时可以不配置。',
    kind: 'internal',
    schema: optionalTemplateIdSchema.min(1),
    environment: 'WECHAT_MINI_PROGRAM_SESSION_REMINDER_TEMPLATE_ID',
    control: 'text',
  },
  {
    key: 'wechat-mini-program.lesson-consumption-template-id',
    group: 'wechat-mini-program',
    groupLabel: '微信小程序',
    groupOrder: 60,
    label: '消课结果模板 ID',
    description: '用于签到消课结果通知；未启用对应通知时可以不配置。',
    kind: 'internal',
    schema: optionalTemplateIdSchema.min(1),
    environment: 'WECHAT_MINI_PROGRAM_LESSON_CONSUMPTION_TEMPLATE_ID',
    control: 'text',
  },
];
