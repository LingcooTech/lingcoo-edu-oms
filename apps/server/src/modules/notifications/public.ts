export { NotificationsService } from './application/notifications.service.js';
export { NOTIFICATION_MAIL_TEMPLATES } from './domain/mail-templates.js';
export type {
  NotificationPreferenceResolver,
  NotificationPublisher,
  PublishNotificationInput,
} from './domain/model.js';
export { createNotificationsModule, createNotificationsService } from './plugin.js';
