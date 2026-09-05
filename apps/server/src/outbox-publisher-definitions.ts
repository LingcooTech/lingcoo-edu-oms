import type { OutboxPublisherDefinition } from './modules/outbox/public.js';

// Side-effecting publishers are loaded only by the standalone Worker process.
export const applicationOutboxPublishers: OutboxPublisherDefinition[] = [];
