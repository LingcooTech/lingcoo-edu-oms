import type { IdentityActionDelivery } from '../../identity/public.js';
import type { SettingsReader } from '../../settings/public.js';
import type { MailQueue } from '../domain/model.js';

export class MailIdentityActionDelivery implements IdentityActionDelivery {
  constructor(
    private readonly mail: MailQueue,
    private readonly settings: SettingsReader,
  ) {}

  async deliver(input: Parameters<IdentityActionDelivery['deliver']>[0]): Promise<void> {
    const applicationName =
      (await this.settings.getValue<string>('application.name')) ?? 'Application';
    const baseUrl =
      (await this.settings.getValue<string>('application.public-url')) ?? 'http://localhost:5173';
    const path =
      input.purpose === 'password_reset' ? '/admin/reset-password' : '/admin/verify-email';
    const actionUrl = new URL(path, baseUrl);
    actionUrl.searchParams.set('token', input.token);
    await this.mail.queue(
      {
        templateKey:
          input.purpose === 'password_reset'
            ? 'identity.password-reset'
            : 'identity.email-verification',
        to: input.email,
        variables: {
          applicationName,
          actionUrl: actionUrl.toString(),
          expiresAt: input.expiresAt.toISOString(),
        },
        deduplicationKey: `identity:${input.purpose}:${input.userId}:${input.tokenDigest}`,
      },
      input.transaction,
    );
  }
}
