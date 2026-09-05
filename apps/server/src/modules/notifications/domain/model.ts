import type { NotificationChannel, NotificationLevel } from '@lingcoo-edu-oms/contracts';

import type { DatabaseTransaction } from '../../../database/database.js';

export interface PublishNotificationInput {
  recipientUserId: string;
  category: string;
  level?: NotificationLevel;
  title: string;
  body: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  sourceType: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  deduplicationKey: string;
  channels?: NotificationChannel[];
  announcementId?: string | null;
}

export interface NotificationPublisher {
  publish(
    input: PublishNotificationInput,
    transaction: DatabaseTransaction,
  ): Promise<{ id: string; deduplicated: boolean; mailDeliveryId: string | null }>;
}

export interface NotificationPreferenceResolver {
  resolve(input: {
    recipientUserId: string;
    category: string;
    requestedChannels: NotificationChannel[];
    recipientStatus: 'active' | 'disabled';
  }): Promise<{ channels: NotificationChannel[] }>;
}
