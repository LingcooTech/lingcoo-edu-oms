import nodemailer from 'nodemailer';

import type { SettingsConnectionTester, SettingsReader } from '../../settings/public.js';
import type { MailFailureSnapshot, MailProvider, MailProviderResult } from '../domain/model.js';

interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromAddress: string;
  fromName: string;
}

export class MailProviderError extends Error {
  constructor(readonly failure: MailFailureSnapshot) {
    super(failure.message);
    this.name = 'MailProviderError';
  }
}

export interface MailLogger {
  info(bindings: Record<string, unknown>, message: string): void;
}

export class ConfiguredMailProvider implements MailProvider {
  constructor(
    private readonly settings: SettingsReader,
    private readonly logger: MailLogger,
  ) {}

  async send(input: {
    deliveryId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    signal: AbortSignal;
  }): Promise<MailProviderResult> {
    const transport = (await this.settings.getValue<string>('mail.transport')) ?? 'capture';
    if (transport === 'capture') {
      this.logger.info(
        { deliveryId: input.deliveryId, transport: 'capture' },
        'mail delivery captured',
      );
      return { transport: 'capture', simulated: true, messageId: null };
    }
    const config = await smtpConfiguration(this.settings);
    const client = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    const close = () => client.close();
    input.signal.addEventListener('abort', close, { once: true });
    try {
      if (input.signal.aborted)
        throw new MailProviderError({
          code: 'MAIL_SEND_ABORTED',
          message: '邮件发送已中止',
          statusCode: 503,
          retryable: true,
        });
      const result = await client.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        messageId: `<${input.deliveryId}@mail.local>`,
      });
      return {
        transport: 'smtp',
        simulated: false,
        messageId: sanitizeMessageId(result.messageId),
      };
    } catch (error) {
      throw classifySmtpError(error);
    } finally {
      input.signal.removeEventListener('abort', close);
      client.close();
    }
  }
}

async function smtpConfiguration(settings: SettingsReader): Promise<SmtpConfiguration> {
  const [host, port, secure, user, password, fromAddress, fromName] = await Promise.all([
    settings.getValue<string>('mail.smtp-host'),
    settings.getValue<number>('mail.smtp-port'),
    settings.getValue<boolean>('mail.smtp-secure'),
    settings.getValue<string>('mail.smtp-user'),
    settings.getValue<string>('mail.smtp-password'),
    settings.getValue<string>('mail.from-address'),
    settings.getValue<string>('mail.from-name'),
  ]);
  if (!host || !port || !fromAddress)
    throw new MailProviderError({
      code: 'MAIL_SMTP_NOT_CONFIGURED',
      message: 'SMTP 设置不完整',
      statusCode: 409,
      retryable: false,
    });
  return {
    host,
    port,
    secure: secure ?? false,
    user: user || undefined,
    password: password || undefined,
    fromAddress,
    fromName: fromName ?? 'Application',
  };
}

function sanitizeMessageId(value: unknown): string | null {
  return typeof value === 'string' ? value.replace(/[\r\n]/g, '').slice(0, 500) : null;
}

export function classifySmtpError(error: unknown): MailProviderError {
  if (error instanceof MailProviderError) return error;
  const candidate = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const responseCode = typeof candidate.responseCode === 'number' ? candidate.responseCode : null;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const permanent = responseCode !== null && responseCode >= 500 && responseCode < 600;
  const configuration = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE']).has(code);
  return new MailProviderError({
    code: permanent || configuration ? 'MAIL_SMTP_REJECTED' : 'MAIL_SMTP_UNAVAILABLE',
    message:
      permanent || configuration
        ? 'SMTP 拒绝了邮件或配置无效'
        : 'SMTP 暂时不可用，将按退避策略重试',
    statusCode: permanent || configuration ? 422 : 503,
    retryable: !(permanent || configuration),
  });
}

export function createSmtpConnectionTester(settings: SettingsReader): SettingsConnectionTester {
  return {
    key: 'mail.smtp',
    group: 'mail',
    label: '测试 SMTP 连接',
    description: '仅验证连接和认证，不发送邮件。',
    requiredSettings: ['mail.smtp-host', 'mail.smtp-port', 'mail.smtp-secure', 'mail.from-address'],
    timeoutMs: 12_000,
    async test(_values, signal) {
      try {
        const config = await smtpConfiguration(settings);
        const client = nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.user ? { user: config.user, pass: config.password } : undefined,
          connectionTimeout: 8_000,
          greetingTimeout: 8_000,
          socketTimeout: 10_000,
        });
        const close = () => client.close();
        signal.addEventListener('abort', close, { once: true });
        try {
          await client.verify();
          return { ok: true, message: 'SMTP 连接和认证成功' };
        } finally {
          signal.removeEventListener('abort', close);
          client.close();
        }
      } catch (error) {
        const failure = classifySmtpError(error).failure;
        return { ok: false, message: failure.message, code: failure.code };
      }
    },
  };
}
