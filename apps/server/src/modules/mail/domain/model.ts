import type { MailDeliveryQuery, UpdateMailTemplateRequest } from '@lingcoo-edu-oms/contracts';

import type { DatabaseTransaction } from '../../../database/database.js';

export interface QueueMailInput {
  templateKey: string;
  to: string;
  variables: Record<string, string>;
  deduplicationKey?: string;
}

export interface MailQueue {
  queue(
    input: QueueMailInput,
    transaction: DatabaseTransaction,
  ): Promise<{ id: string; deduplicated: boolean }>;
}

export interface MailProviderResult {
  transport: 'capture' | 'smtp';
  simulated: boolean;
  messageId: string | null;
}

export interface MailProvider {
  send(input: {
    deliveryId: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    signal: AbortSignal;
  }): Promise<MailProviderResult>;
}

export interface MailFailureSnapshot {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export type { MailDeliveryQuery, UpdateMailTemplateRequest };
