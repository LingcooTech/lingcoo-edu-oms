import type { OutboxEventDefinition } from './modules/outbox/public.js';
import { z } from 'zod';

export const lessonAccountChangedPayloadSchema = z.object({
  accountId: z.uuid(),
  institutionId: z.uuid(),
  studentId: z.uuid(),
  movementId: z.uuid(),
  sequence: z.number().int().positive(),
  type: z.enum([
    'grant',
    'adjustment_credit',
    'adjustment_debit',
    'clawback',
    'grant_reversal',
    'consume',
    'consume_reversal',
  ]),
  direction: z.enum(['credit', 'debit']),
  units: z.number().int().positive(),
  balanceAfterUnits: z.number().int().nonnegative(),
});

// Stable event names, versions, and Payload Schemas are shared by API and Worker.
export const applicationOutboxEvents: OutboxEventDefinition[] = [
  {
    topic: 'education.lesson-account.changed',
    eventVersion: 1,
    payloadSchema: lessonAccountChangedPayloadSchema,
  },
];
