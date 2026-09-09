import { randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  announcementChannelsSchema,
  notificationCategorySchema,
  notificationCtaUrlSchema,
  notificationLevelSchema,
  type Notification,
  type NotificationChannel,
  type NotificationQuery,
} from '@lingcoo-edu-oms/contracts';
import { z } from 'zod';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { MailQueue } from '../../mail/public.js';
import type {
  NotificationPreferenceResolver,
  NotificationPublisher,
  NotificationRecipientDirectory,
  PublishNotificationInput,
} from '../domain/model.js';
import type { NotificationsRepository } from '../infrastructure/persistence/notifications.repository.js';
import { notificationDigest } from './notification-hash.js';

const publishInputSchema = z
  .object({
    recipientUserId: z.uuid(),
    category: notificationCategorySchema,
    level: notificationLevelSchema.default('info'),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5_000),
    ctaLabel: z.string().trim().min(1).max(80).nullable().optional(),
    ctaUrl: notificationCtaUrlSchema.nullable().optional(),
    sourceType: z.string().trim().min(1).max(120),
    sourceId: z.string().trim().min(1).max(200).nullable().optional(),
    metadata: z
      .record(z.string(), z.json())
      .refine(
        (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 16_384,
        '通知业务元数据不能超过 16 KiB',
      )
      .default({}),
    deduplicationKey: z.string().trim().min(1).max(200),
    channels: announcementChannelsSchema.default(['in_app']),
    announcementId: z.uuid().nullable().optional(),
  })
  .refine((value) => Boolean(value.ctaLabel) === Boolean(value.ctaUrl), {
    message: '操作文案和操作链接必须同时提供',
    path: ['ctaLabel'],
  });

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceResolver = {
  async resolve(input) {
    return {
      channels:
        input.recipientStatus === 'active'
          ? input.requestedChannels
          : input.requestedChannels.filter((channel) => channel !== 'email'),
    };
  },
};

export class NotificationDeliveryService implements NotificationPublisher {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: NotificationsRepository,
    private readonly recipients: NotificationRecipientDirectory,
    private readonly mail: MailQueue,
    private readonly preferences: NotificationPreferenceResolver,
    private readonly applicationName: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async publish(input: PublishNotificationInput, transaction: DatabaseTransaction) {
    const parsed = publishInputSchema.parse(input);
    const recipient = await this.recipients.findById(parsed.recipientUserId, transaction);
    if (!recipient)
      throw new ApiError(404, 'NOTIFICATION_RECIPIENT_NOT_FOUND', '通知接收账号不存在');
    const resolution = await this.preferences.resolve({
      recipientUserId: recipient.id,
      recipientStatus: recipient.status,
      category: parsed.category,
      requestedChannels: parsed.channels,
    });
    const channels: NotificationChannel[] = ['in_app'];
    if (
      recipient.email &&
      parsed.channels.includes('email') &&
      resolution.channels.includes('email')
    ) {
      channels.push('email');
    }
    const deduplicationHash = notificationDigest([parsed.recipientUserId, parsed.deduplicationKey]);
    const metadata =
      !recipient.email && parsed.channels.includes('email')
        ? {
            ...parsed.metadata,
            emailDelivery: { status: 'skipped', reason: 'recipient_email_missing' },
          }
        : parsed.metadata;
    const contentHash = notificationDigest({
      recipientUserId: parsed.recipientUserId,
      category: parsed.category,
      level: parsed.level,
      title: parsed.title,
      body: parsed.body,
      ctaLabel: parsed.ctaLabel ?? null,
      ctaUrl: parsed.ctaUrl ?? null,
      sourceType: parsed.sourceType,
      sourceId: parsed.sourceId ?? null,
      metadata,
      channels,
      announcementId: parsed.announcementId ?? null,
    });
    const existing = await this.repository.findNotificationByDeduplication(
      deduplicationHash,
      transaction,
    );
    if (existing) return this.resolveDuplicate(existing, contentHash);

    const id = randomUUID();
    const emailRequested = channels.includes('email');
    const mailDelivery =
      emailRequested && recipient.email
        ? await this.mail.queue(
            {
              templateKey: 'notifications.generic',
              to: recipient.email,
              variables: {
                applicationName: this.applicationName,
                title: parsed.title,
                body: parsed.body,
                actionText:
                  parsed.ctaLabel && parsed.ctaUrl
                    ? `${parsed.ctaLabel}：${parsed.ctaUrl}`
                    : '此通知无需额外操作。',
              },
              deduplicationKey: `notification:${deduplicationHash}:email`,
            },
            transaction,
          )
        : null;
    const inserted = await this.repository.insertNotification(
      {
        id,
        recipientUserId: parsed.recipientUserId,
        announcementId: parsed.announcementId ?? null,
        mailDeliveryId: mailDelivery?.id ?? null,
        category: parsed.category,
        level: parsed.level,
        title: parsed.title,
        body: parsed.body,
        ctaLabel: parsed.ctaLabel ?? null,
        ctaUrl: parsed.ctaUrl ?? null,
        sourceType: parsed.sourceType,
        sourceId: parsed.sourceId ?? null,
        metadata,
        deduplicationHash,
        contentHash,
        emailRequested,
      },
      transaction,
    );
    if (inserted) {
      return { id: inserted.id, deduplicated: false, mailDeliveryId: inserted.mailDeliveryId };
    }
    const concurrent = await this.repository.findNotificationByDeduplication(
      deduplicationHash,
      transaction,
    );
    if (!concurrent)
      throw new ApiError(409, 'NOTIFICATION_DEDUPLICATION_BUSY', '通知去重记录正在变化，请重试');
    return this.resolveDuplicate(concurrent, contentHash);
  }

  async list(recipientUserId: string, query: NotificationQuery) {
    const result = await this.repository.searchForRecipient(recipientUserId, query);
    return {
      items: result.items.map((item) => this.toNotification(item)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async unreadCount(recipientUserId: string) {
    return { count: await this.repository.unreadCount(recipientUserId) };
  }

  async markRead(id: string, recipientUserId: string) {
    return this.database.transaction(async (transaction) => {
      const current = await this.repository.findOwned(id, recipientUserId, transaction);
      if (!current || current.withdrawnAt)
        throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在');
      if (current.archivedAt)
        throw new ApiError(409, 'NOTIFICATION_ARCHIVED', '已归档通知不能再标记为已读');
      if (current.readAt) return this.toNotification(current);
      const updated = await this.repository.markRead(
        id,
        recipientUserId,
        this.clock(),
        transaction,
      );
      if (!updated) throw new ApiError(409, 'NOTIFICATION_STATE_CONFLICT', '通知状态正在变化');
      return this.toNotification(updated);
    });
  }

  async markAllRead(recipientUserId: string) {
    return this.database.transaction(async (transaction) => ({
      updatedCount: await this.repository.markAllRead(recipientUserId, this.clock(), transaction),
    }));
  }

  async archive(id: string, recipientUserId: string) {
    return this.database.transaction(async (transaction) => {
      const current = await this.repository.findOwned(id, recipientUserId, transaction);
      if (!current || current.withdrawnAt)
        throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在');
      if (current.archivedAt) return this.toNotification(current);
      const updated = await this.repository.archive(id, recipientUserId, this.clock(), transaction);
      if (!updated) throw new ApiError(409, 'NOTIFICATION_STATE_CONFLICT', '通知状态正在变化');
      return this.toNotification(updated);
    });
  }

  private resolveDuplicate(
    record: NonNullable<
      Awaited<ReturnType<NotificationsRepository['findNotificationByDeduplication']>>
    >,
    contentHash: string,
  ) {
    if (record.contentHash !== contentHash)
      throw new ApiError(409, 'NOTIFICATION_DEDUPLICATION_CONFLICT', '通知去重键已用于不同内容');
    return { id: record.id, deduplicated: true, mailDeliveryId: record.mailDeliveryId };
  }

  private toNotification(record: {
    id: string;
    category: string;
    level: string;
    title: string;
    body: string;
    ctaLabel: string | null;
    ctaUrl: string | null;
    sourceType: string;
    sourceId: string | null;
    metadata: Record<string, unknown>;
    readAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
  }): Notification {
    return {
      id: record.id,
      category: record.category,
      level: record.level as Notification['level'],
      title: record.title,
      body: record.body,
      ctaLabel: record.ctaLabel,
      ctaUrl: record.ctaUrl,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      metadata: record.metadata,
      status: record.archivedAt ? 'archived' : record.readAt ? 'read' : 'unread',
      readAt: record.readAt?.toISOString() ?? null,
      archivedAt: record.archivedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
