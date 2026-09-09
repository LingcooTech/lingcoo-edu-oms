import { ApiError } from '@lingcoo-tech/http';
import type {
  AnnouncementAudience,
  AnnouncementQuery,
  CreateAnnouncementRequest,
  NotificationChannel,
  UpdateAnnouncementRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { JobsService } from '../../jobs/public.js';
import type { NotificationPublisher, NotificationRecipientDirectory } from '../domain/model.js';
import type { NotificationsRepository } from '../infrastructure/persistence/notifications.repository.js';
import { notificationDigest } from './notification-hash.js';

type ActorContext = AuditContext & { actorId: string };
type StoredAnnouncement = NonNullable<
  Awaited<ReturnType<NotificationsRepository['findAnnouncement']>>
>;
const MAX_BROADCAST_RECIPIENTS = 10_000;
const BROADCAST_BATCH_SIZE = 100;

export class AnnouncementService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: NotificationsRepository,
    private readonly jobs: JobsService,
    private readonly recipients: NotificationRecipientDirectory,
    private readonly notifications: NotificationPublisher,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(input: CreateAnnouncementRequest, actor: ActorContext) {
    const deduplicationHash = notificationDigest(input.deduplicationKey);
    const createRequestHash = notificationDigest({
      audience:
        input.audience.type === 'selected_users'
          ? { type: input.audience.type, userIds: [...input.audience.userIds].sort() }
          : input.audience,
      body: input.body,
      channels: [...input.channels].sort(),
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.ctaUrl ?? null,
      level: input.level,
      title: input.title,
    });
    return this.database.transaction(async (transaction) => {
      const inserted = await this.repository.insertAnnouncement(
        {
          audienceType: input.audience.type,
          channels: input.channels,
          level: input.level,
          title: input.title,
          body: input.body,
          ctaLabel: input.ctaLabel ?? null,
          ctaUrl: input.ctaUrl ?? null,
          deduplicationHash,
          createRequestHash,
          recipientCount:
            input.audience.type === 'selected_users' ? input.audience.userIds.length : 0,
          createdBy: actor.actorId,
          updatedBy: actor.actorId,
        },
        transaction,
      );
      const announcement =
        inserted ??
        (await this.repository.findAnnouncementByDeduplication(deduplicationHash, transaction));
      if (!announcement)
        throw new ApiError(409, 'ANNOUNCEMENT_DEDUPLICATION_BUSY', '公告去重记录正在变化');
      if (!inserted) {
        if (announcement.createRequestHash !== createRequestHash)
          throw new ApiError(
            409,
            'ANNOUNCEMENT_DEDUPLICATION_CONFLICT',
            '公告去重键已用于不同内容',
          );
        return this.toAnnouncement(announcement);
      }
      await this.saveAudience(announcement.id, input.audience, transaction);
      await this.audit.record(
        {
          ...actor,
          category: 'business',
          action: 'notification.announcement.created',
          resourceType: 'notification_announcement',
          resourceId: announcement.id,
          metadata: { audienceType: announcement.audienceType, channels: announcement.channels },
        },
        transaction,
      );
      return this.toAnnouncement(announcement);
    });
  }

  async update(id: string, input: UpdateAnnouncementRequest, actor: ActorContext) {
    return this.database.transaction(async (transaction) => {
      const current = await this.requireLocked(id, transaction);
      if (current.status !== 'draft')
        throw new ApiError(409, 'ANNOUNCEMENT_NOT_EDITABLE', '只有草稿公告可以编辑');
      if (current.revision !== input.expectedRevision) this.versionConflict();
      await this.saveAudience(id, input.audience, transaction);
      const updated = await this.repository.updateDraft(
        id,
        input.expectedRevision,
        {
          audienceType: input.audience.type,
          channels: input.channels,
          level: input.level,
          title: input.title,
          body: input.body,
          ctaLabel: input.ctaLabel ?? null,
          ctaUrl: input.ctaUrl ?? null,
          recipientCount:
            input.audience.type === 'selected_users' ? input.audience.userIds.length : 0,
          updatedBy: actor.actorId,
        },
        transaction,
      );
      if (!updated) this.versionConflict();
      await this.audit.record(
        {
          ...actor,
          category: 'business',
          action: 'notification.announcement.updated',
          resourceType: 'notification_announcement',
          resourceId: id,
        },
        transaction,
      );
      return this.toAnnouncement(updated!);
    });
  }

  async publish(id: string, expectedRevision: number, actor: ActorContext) {
    return this.database.transaction(async (transaction) => {
      const current = await this.requireLocked(id, transaction);
      if (current.status !== 'draft')
        throw new ApiError(409, 'ANNOUNCEMENT_NOT_PUBLISHABLE', '只有草稿公告可以发布');
      if (current.revision !== expectedRevision) this.versionConflict();
      const recipients = await this.snapshotRecipients(current, transaction);
      if (!recipients.length)
        throw new ApiError(400, 'ANNOUNCEMENT_AUDIENCE_EMPTY', '公告没有可用的活跃接收账号');
      const job = await this.jobs.enqueue(
        {
          type: 'notifications.publish-announcement',
          payload: { announcementId: id },
          deduplicationKey: `notifications.publish-announcement:${id}`,
        },
        transaction,
      );
      const updated = await this.repository.bindPublishJob(
        id,
        expectedRevision,
        recipients.length,
        job.id,
        actor.actorId,
        transaction,
      );
      if (!updated) this.versionConflict();
      await this.audit.record(
        {
          ...actor,
          category: 'business',
          action: 'notification.announcement.publishing',
          resourceType: 'notification_announcement',
          resourceId: id,
          metadata: { recipientCount: recipients.length, channels: current.channels },
        },
        transaction,
      );
      return this.toAnnouncement(updated!);
    });
  }

  async withdraw(id: string, expectedRevision: number, actor: ActorContext) {
    return this.database.transaction(async (transaction) => {
      const current = await this.requireLocked(id, transaction);
      if (!['publishing', 'published'].includes(current.status))
        throw new ApiError(409, 'ANNOUNCEMENT_NOT_WITHDRAWABLE', '只有发布中或已发布公告可以撤回');
      if (current.revision !== expectedRevision) this.versionConflict();
      const updated = await this.repository.withdrawAnnouncement(
        id,
        expectedRevision,
        actor.actorId,
        transaction,
      );
      if (!updated) this.versionConflict();
      await this.audit.record(
        {
          ...actor,
          category: 'business',
          action: 'notification.announcement.withdrawn',
          resourceType: 'notification_announcement',
          resourceId: id,
          metadata: { deliveredCount: current.deliveredCount },
        },
        transaction,
      );
      return this.toAnnouncement(updated!);
    });
  }

  async list(query: AnnouncementQuery) {
    const result = await this.repository.searchAnnouncements(query);
    return {
      items: result.items.map((item) => this.toAnnouncement(item)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string) {
    const announcement = await this.repository.findAnnouncement(id);
    if (!announcement) throw new ApiError(404, 'ANNOUNCEMENT_NOT_FOUND', '公告不存在');
    const userIds =
      announcement.audienceType === 'selected_users'
        ? await this.repository.targetRecipientIds(id, this.database.db)
        : [];
    return {
      ...this.toAnnouncement(announcement),
      audience:
        announcement.audienceType === 'selected_users'
          ? { type: 'selected_users' as const, userIds }
          : { type: 'all_active_users' as const },
    };
  }

  async process(id: string, signal: AbortSignal): Promise<void> {
    for (;;) {
      signal.throwIfAborted();
      const shouldContinue = await this.database.transaction(async (transaction) => {
        const announcement = await this.repository.lockAnnouncement(id, transaction);
        if (!announcement) throw new ApiError(404, 'ANNOUNCEMENT_NOT_FOUND', '公告不存在');
        if (announcement.status !== 'publishing') return false;
        const targets = await this.repository.lockPendingTargets(
          id,
          BROADCAST_BATCH_SIZE,
          transaction,
        );
        if (!targets.length) {
          await this.finish(id, transaction);
          return false;
        }
        for (const target of targets) {
          signal.throwIfAborted();
          const notification = await this.notifications.publish(
            {
              recipientUserId: target.recipientUserId,
              category: 'announcement',
              level: announcement.level as 'info' | 'success' | 'warning' | 'error',
              title: announcement.title,
              body: announcement.body,
              ctaLabel: announcement.ctaLabel,
              ctaUrl: announcement.ctaUrl,
              sourceType: 'notification_announcement',
              sourceId: announcement.id,
              metadata: { announcementId: announcement.id },
              deduplicationKey: `announcement:${announcement.id}`,
              channels: announcement.channels,
              announcementId: announcement.id,
            },
            transaction,
          );
          const delivered = await this.repository.markTargetDelivered(
            id,
            target.recipientUserId,
            notification.id,
            this.clock(),
            transaction,
          );
          if (!delivered)
            throw new ApiError(409, 'ANNOUNCEMENT_TARGET_CONFLICT', '公告接收状态正在变化');
        }
        const progress = await this.repository.incrementDelivered(id, targets.length, transaction);
        if (!progress)
          throw new ApiError(409, 'ANNOUNCEMENT_STATE_CONFLICT', '公告发布状态正在变化');
        if (progress.deliveredCount === progress.recipientCount) {
          await this.finish(id, transaction);
          return false;
        }
        return true;
      });
      if (!shouldContinue) return;
    }
  }

  private async finish(id: string, transaction: DatabaseTransaction) {
    const published = await this.repository.markPublished(id, transaction);
    if (!published) return;
    await this.audit.record(
      {
        actorType: 'system',
        actorLabel: 'Notifications Worker',
        category: 'business',
        action: 'notification.announcement.published',
        resourceType: 'notification_announcement',
        resourceId: id,
        metadata: { recipientCount: published.recipientCount },
      },
      transaction,
    );
  }

  private async saveAudience(
    id: string,
    audience: AnnouncementAudience,
    transaction: DatabaseTransaction,
  ) {
    if (audience.type === 'all_active_users') {
      await this.repository.replaceTargets(id, [], transaction);
      return;
    }
    const active = await this.recipients.findActiveByIds(audience.userIds);
    if (active.length !== audience.userIds.length)
      throw new ApiError(400, 'ANNOUNCEMENT_AUDIENCE_INVALID', '指定受众包含不存在或已停用的账号');
    await this.repository.replaceTargets(
      id,
      active.map((user) => user.id),
      transaction,
    );
  }

  private async snapshotRecipients(
    announcement: StoredAnnouncement,
    transaction: DatabaseTransaction,
  ) {
    if (announcement.audienceType === 'all_active_users') {
      const users = await this.recipients.listActive(MAX_BROADCAST_RECIPIENTS + 1);
      if (users.length > MAX_BROADCAST_RECIPIENTS)
        throw new ApiError(
          400,
          'ANNOUNCEMENT_AUDIENCE_TOO_LARGE',
          `通用公告最多支持 ${MAX_BROADCAST_RECIPIENTS} 个账号，请由具体应用提供分群发布器`,
        );
      const ids = users.map((user) => user.id);
      await this.repository.replaceTargets(announcement.id, ids, transaction);
      return ids;
    }
    const ids = await this.repository.targetRecipientIds(announcement.id, transaction);
    const active = await this.recipients.findActiveByIds(ids);
    if (active.length !== ids.length)
      throw new ApiError(
        409,
        'ANNOUNCEMENT_AUDIENCE_CHANGED',
        '指定受众状态已变化，请更新草稿后重试',
      );
    return ids;
  }

  private async requireLocked(id: string, transaction: DatabaseTransaction) {
    const announcement = await this.repository.lockAnnouncement(id, transaction);
    if (!announcement) throw new ApiError(404, 'ANNOUNCEMENT_NOT_FOUND', '公告不存在');
    return announcement;
  }

  private toAnnouncement(record: {
    id: string;
    status: string;
    audienceType: string;
    channels: NotificationChannel[];
    level: string;
    title: string;
    body: string;
    ctaLabel: string | null;
    ctaUrl: string | null;
    recipientCount: number;
    deliveredCount: number;
    revision: number;
    createdBy: string | null;
    publishedAt: Date | null;
    withdrawnAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: record.id,
      status: record.status as 'draft' | 'publishing' | 'published' | 'withdrawn',
      audienceType: record.audienceType as 'all_active_users' | 'selected_users',
      channels: record.channels,
      level: record.level as 'info' | 'success' | 'warning' | 'error',
      title: record.title,
      body: record.body,
      ctaLabel: record.ctaLabel,
      ctaUrl: record.ctaUrl,
      recipientCount: record.recipientCount,
      deliveredCount: record.deliveredCount,
      revision: record.revision,
      createdBy: record.createdBy,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      withdrawnAt: record.withdrawnAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private versionConflict(): never {
    throw new ApiError(409, 'ANNOUNCEMENT_VERSION_CONFLICT', '公告已被其他操作更新，请刷新后重试');
  }
}
