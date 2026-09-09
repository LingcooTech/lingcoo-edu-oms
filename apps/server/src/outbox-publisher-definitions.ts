import type { OutboxPublisherDefinition } from './modules/outbox/public.js';
import { lessonAccountChangedPayloadSchema } from './outbox-event-definitions.js';

// Side-effecting publishers are loaded only by the standalone Worker process.
export const applicationOutboxPublishers: OutboxPublisherDefinition[] = [
  {
    topic: 'education.lesson-account.changed',
    async handler(event) {
      // P3 publishes a durable integration fact without external side effects. P4 notification
      // consumers can subscribe through an inbox without gaining write access to the ledger.
      lessonAccountChangedPayloadSchema.parse(event.payload);
    },
  },
];
