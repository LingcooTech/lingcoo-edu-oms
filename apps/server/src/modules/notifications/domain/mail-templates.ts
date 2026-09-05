import { z } from 'zod';

export const NOTIFICATION_MAIL_TEMPLATES = [
  {
    key: 'notifications.generic',
    name: '通用业务通知',
    description: '业务通知或公告明确请求邮件渠道时发送。',
    version: 1,
    variables: z.object({
      applicationName: z.string().min(1).max(120),
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(5_000),
      actionText: z.string().max(2_200),
    }),
    subjectTemplate: '[{{applicationName}}] {{title}}',
    textTemplate: '{{body}}\n\n{{actionText}}',
  },
];
