// This file is the Drizzle composition point. Tables remain owned by their module.
export * from '../modules/identity/infrastructure/persistence/identity.schema.js';
export * from '../modules/access-control/infrastructure/persistence/access-control.schema.js';
export * from '../modules/audit/infrastructure/persistence/audit.schema.js';
export * from '../modules/settings/infrastructure/persistence/settings.schema.js';
export * from '../modules/idempotency/infrastructure/persistence/idempotency.schema.js';
export * from '../modules/jobs/infrastructure/persistence/jobs.schema.js';
export * from '../modules/outbox/infrastructure/persistence/outbox.schema.js';
export * from '../modules/mail/infrastructure/persistence/mail.schema.js';
export * from '../modules/notifications/infrastructure/persistence/notifications.schema.js';
export * from '../modules/storage/infrastructure/persistence/storage.schema.js';
export * from '../modules/branding/infrastructure/persistence/branding.schema.js';
export * from '../modules/payments/infrastructure/persistence/payments.schema.js';
