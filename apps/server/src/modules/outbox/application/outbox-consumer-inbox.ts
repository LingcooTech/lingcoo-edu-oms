import { outboxTopicSchema } from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle } from '../../../database/database.js';
import type { DatabaseTransaction } from '../../../database/database.js';
import type { OutboxConsumerDeduplicationContract } from '../domain/model.js';
import { outboxConsumerReceipts } from '../infrastructure/persistence/outbox.schema.js';

export class OutboxConsumerInbox implements OutboxConsumerDeduplicationContract {
  readonly consumer: string;

  constructor(
    private readonly database: DatabaseHandle,
    consumer: string,
  ) {
    this.consumer = outboxTopicSchema.parse(consumer);
  }

  consumeOnce<T>(
    eventId: string,
    work: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<{ duplicate: boolean; value?: T }> {
    return this.database.transaction(async (transaction) => {
      const [receipt] = await transaction
        .insert(outboxConsumerReceipts)
        .values({ consumer: this.consumer, eventId })
        .onConflictDoNothing()
        .returning({ eventId: outboxConsumerReceipts.eventId });
      if (!receipt) return { duplicate: true };
      const value = await work(transaction);
      return { duplicate: false, value };
    });
  }
}
