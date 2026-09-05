import type { OutboxEventDefinition } from './modules/outbox/public.js';

// Stable event names, versions, and Payload Schemas are shared by API and Worker.
export const applicationOutboxEvents: OutboxEventDefinition[] = [];
