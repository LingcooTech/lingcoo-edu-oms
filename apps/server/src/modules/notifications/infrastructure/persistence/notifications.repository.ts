import type { AnnouncementQuery, NotificationQuery } from '@lingcoo-edu-oms/contracts';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { identityUsers } from '../../../identity/public.js';
import {
  notificationAnnouncements,
  notificationAnnouncementTargets,
  notifications,
} from './notifications.schema.js';

export class NotificationsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async findRecipient(id: string, executor: DatabaseExecutor) {
    const [user] = await executor
      .select({
        id: identityUsers.id,
        email: identityUsers.email,
        status: identityUsers.status,
      })
      .from(identityUsers)
      .where(eq(identityUsers.id, id))
      .limit(1);
    return user ?? null;
  }

  async insertNotification(
    input: typeof notifications.$inferInsert,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(notifications)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findNotificationByDeduplication(hash: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(notifications)
      .where(eq(notifications.deduplicationHash, hash))
      .limit(1);
    return record ?? null;
  }

  async searchForRecipient(recipientUserId: string, query: NotificationQuery) {
    const filters: SQL[] = [
      eq(notifications.recipientUserId, recipientUserId),
      isNull(notifications.withdrawnAt),
    ];
    if (!query.includeArchived) filters.push(isNull(notifications.archivedAt));
    if (query.status === 'unread') {
      filters.push(isNull(notifications.readAt), isNull(notifications.archivedAt));
    } else if (query.status === 'read') {
      filters.push(isNotNull(notifications.readAt), isNull(notifications.archivedAt));
    } else if (query.status === 'archived') {
      filters.push(isNotNull(notifications.archivedAt));
    }
    if (query.category) filters.push(eq(notifications.category, query.category));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const filter = or(
        ilike(notifications.title, pattern),
        ilike(notifications.body, pattern),
        ilike(notifications.category, pattern),
      );
      if (filter) filters.push(filter);
    }
    const where = and(...filters);
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(notifications).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async unreadCount(recipientUserId: string) {
    const [result] = await this.database.db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, recipientUserId),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          isNull(notifications.withdrawnAt),
        ),
      );
    return result?.value ?? 0;
  }

  async findOwned(id: string, recipientUserId: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.recipientUserId, recipientUserId)))
      .limit(1);
    return record ?? null;
  }

  async markRead(id: string, recipientUserId: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(notifications)
      .set({ readAt: now, updatedAt: now })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientUserId, recipientUserId),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          isNull(notifications.withdrawnAt),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markAllRead(recipientUserId: string, now: Date, executor: DatabaseTransaction) {
    const records = await executor
      .update(notifications)
      .set({ readAt: now, updatedAt: now })
      .where(
        and(
          eq(notifications.recipientUserId, recipientUserId),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          isNull(notifications.withdrawnAt),
        ),
      )
      .returning({ id: notifications.id });
    return records.length;
  }

  async archive(id: string, recipientUserId: string, now: Date, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(notifications)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientUserId, recipientUserId),
          isNull(notifications.archivedAt),
          isNull(notifications.withdrawnAt),
        ),
      )
      .returning();
    return record ?? null;
  }

  async insertAnnouncement(
    input: typeof notificationAnnouncements.$inferInsert,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(notificationAnnouncements)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findAnnouncementByDeduplication(hash: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(notificationAnnouncements)
      .where(eq(notificationAnnouncements.deduplicationHash, hash))
      .limit(1);
    return record ?? null;
  }

  async findAnnouncement(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(notificationAnnouncements)
      .where(eq(notificationAnnouncements.id, id))
      .limit(1);
    return record ?? null;
  }

  async lockAnnouncement(id: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(notificationAnnouncements)
      .where(eq(notificationAnnouncements.id, id))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async searchAnnouncements(query: AnnouncementQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(notificationAnnouncements.status, query.status));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const filter = or(
        ilike(notificationAnnouncements.title, pattern),
        ilike(notificationAnnouncements.body, pattern),
      );
      if (filter) filters.push(filter);
    }
    const where = filters.length ? and(...filters) : undefined;
    const [items, totals] = await Promise.all([
      this.database.db
        .select()
        .from(notificationAnnouncements)
        .where(where)
        .orderBy(desc(notificationAnnouncements.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(notificationAnnouncements).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async updateDraft(
    id: string,
    revision: number,
    input: Partial<typeof notificationAnnouncements.$inferInsert>,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(notificationAnnouncements)
      .set({ ...input, revision: revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(notificationAnnouncements.id, id),
          eq(notificationAnnouncements.status, 'draft'),
          eq(notificationAnnouncements.revision, revision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async replaceTargets(
    announcementId: string,
    recipientUserIds: string[],
    executor: DatabaseTransaction,
  ) {
    await executor
      .delete(notificationAnnouncementTargets)
      .where(eq(notificationAnnouncementTargets.announcementId, announcementId));
    if (recipientUserIds.length) {
      await executor
        .insert(notificationAnnouncementTargets)
        .values(recipientUserIds.map((recipientUserId) => ({ announcementId, recipientUserId })));
    }
  }

  async activeUsers(limit: number, executor: DatabaseExecutor) {
    return executor
      .select({ id: identityUsers.id })
      .from(identityUsers)
      .where(eq(identityUsers.status, 'active'))
      .orderBy(asc(identityUsers.id))
      .limit(limit);
  }

  async activeUsersByIds(ids: string[], executor: DatabaseExecutor) {
    if (!ids.length) return [];
    return executor
      .select({ id: identityUsers.id })
      .from(identityUsers)
      .where(and(inArray(identityUsers.id, ids), eq(identityUsers.status, 'active')))
      .orderBy(asc(identityUsers.id));
  }

  async targetRecipientIds(announcementId: string, executor: DatabaseExecutor) {
    const rows = await executor
      .select({ id: notificationAnnouncementTargets.recipientUserId })
      .from(notificationAnnouncementTargets)
      .where(eq(notificationAnnouncementTargets.announcementId, announcementId))
      .orderBy(asc(notificationAnnouncementTargets.recipientUserId));
    return rows.map((row) => row.id);
  }

  async bindPublishJob(
    id: string,
    revision: number,
    recipientCount: number,
    jobId: string,
    actorId: string,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(notificationAnnouncements)
      .set({
        status: 'publishing',
        recipientCount,
        deliveredCount: 0,
        publishJobId: jobId,
        revision: revision + 1,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationAnnouncements.id, id),
          eq(notificationAnnouncements.status, 'draft'),
          eq(notificationAnnouncements.revision, revision),
        ),
      )
      .returning();
    return record ?? null;
  }

  async lockPendingTargets(announcementId: string, limit: number, executor: DatabaseTransaction) {
    return executor
      .select()
      .from(notificationAnnouncementTargets)
      .where(
        and(
          eq(notificationAnnouncementTargets.announcementId, announcementId),
          eq(notificationAnnouncementTargets.status, 'pending'),
        ),
      )
      .orderBy(asc(notificationAnnouncementTargets.recipientUserId))
      .limit(limit)
      .for('update', { skipLocked: true });
  }

  async markTargetDelivered(
    announcementId: string,
    recipientUserId: string,
    notificationId: string,
    now: Date,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(notificationAnnouncementTargets)
      .set({ status: 'delivered', notificationId, deliveredAt: now, updatedAt: now })
      .where(
        and(
          eq(notificationAnnouncementTargets.announcementId, announcementId),
          eq(notificationAnnouncementTargets.recipientUserId, recipientUserId),
          eq(notificationAnnouncementTargets.status, 'pending'),
        ),
      )
      .returning();
    return record ?? null;
  }

  async incrementDelivered(id: string, amount: number, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(notificationAnnouncements)
      .set({
        deliveredCount: sql`${notificationAnnouncements.deliveredCount} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(notificationAnnouncements.id, id),
          eq(notificationAnnouncements.status, 'publishing'),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markPublished(id: string, executor: DatabaseTransaction) {
    const now = new Date();
    const [record] = await executor
      .update(notificationAnnouncements)
      .set({
        status: 'published',
        publishedAt: now,
        revision: sql`${notificationAnnouncements.revision} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationAnnouncements.id, id),
          eq(notificationAnnouncements.status, 'publishing'),
          eq(notificationAnnouncements.deliveredCount, notificationAnnouncements.recipientCount),
        ),
      )
      .returning();
    return record ?? null;
  }

  async withdrawAnnouncement(
    id: string,
    revision: number,
    actorId: string,
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    const [record] = await executor
      .update(notificationAnnouncements)
      .set({
        status: 'withdrawn',
        withdrawnAt: now,
        revision: revision + 1,
        updatedBy: actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationAnnouncements.id, id),
          inArray(notificationAnnouncements.status, ['publishing', 'published']),
          eq(notificationAnnouncements.revision, revision),
        ),
      )
      .returning();
    if (!record) return null;
    await executor
      .update(notificationAnnouncementTargets)
      .set({ status: 'cancelled', updatedAt: now })
      .where(
        and(
          eq(notificationAnnouncementTargets.announcementId, id),
          eq(notificationAnnouncementTargets.status, 'pending'),
        ),
      );
    await executor
      .update(notifications)
      .set({ withdrawnAt: now, updatedAt: now })
      .where(and(eq(notifications.announcementId, id), isNull(notifications.withdrawnAt)));
    return record;
  }
}
