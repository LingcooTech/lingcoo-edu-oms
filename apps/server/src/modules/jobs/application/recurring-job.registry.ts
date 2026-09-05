import { jobTypeSchema } from '@lingcoo-edu-oms/contracts';

import type { DueRecurringJob, RecurringJobDefinition } from '../domain/model.js';

const KEY_PATTERN = /^[a-z][a-z0-9._-]*$/;

export class RecurringJobRegistry {
  private readonly definitions = new Map<string, RecurringJobDefinition>();

  constructor(definitions: RecurringJobDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: RecurringJobDefinition): void {
    if (!KEY_PATTERN.test(definition.key) || definition.key.length > 120) {
      throw new Error(`Recurring job key is invalid: ${definition.key}`);
    }
    if (
      !Number.isInteger(definition.intervalMs) ||
      definition.intervalMs < 1_000 ||
      definition.intervalMs > 30 * 24 * 60 * 60_000
    ) {
      throw new Error('Recurring job interval must be between 1 second and 30 days');
    }
    jobTypeSchema.parse(definition.type);
    if (this.definitions.has(definition.key)) {
      throw new Error(`Recurring job already registered: ${definition.key}`);
    }
    this.definitions.set(definition.key, definition);
  }

  due(now: Date): DueRecurringJob[] {
    return [...this.definitions.values()].map((definition) => {
      const bucket = Math.floor(now.getTime() / definition.intervalMs);
      const scheduledAt = new Date(bucket * definition.intervalMs);
      return {
        recurringKey: definition.key,
        scheduledAt,
        type: definition.type,
        payload: definition.payload(scheduledAt),
        priority: definition.priority,
        runAt: scheduledAt,
        deduplicationKey: `recurring:${definition.key}:${bucket}`,
      };
    });
  }
}
