export { createMailModule, createMailService } from './plugin.js';
export { MAIL_SETTINGS } from './domain/mail-settings.js';
export { createSmtpConnectionTester } from './infrastructure/configured-mail.provider.js';
export type { MailQueue, QueueMailInput } from './domain/model.js';
