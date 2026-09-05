import type {
  AnnouncementQuery,
  CreateAnnouncementRequest,
  NotificationQuery,
  UpdateAnnouncementRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext } from '../../audit/public.js';
import type { NotificationPublisher, PublishNotificationInput } from '../domain/model.js';
import type { AnnouncementService } from './announcement.service.js';
import type { NotificationDeliveryService } from './notification-delivery.service.js';

type ActorContext = AuditContext & { actorId: string };

/**
 * Stable module facade. Delivery and announcement workflows stay independently
 * testable while callers depend on one cohesive notifications API.
 */
export class NotificationsService implements NotificationPublisher {
  constructor(
    private readonly delivery: NotificationDeliveryService,
    private readonly announcements: AnnouncementService,
  ) {}

  publish(input: PublishNotificationInput, transaction: DatabaseTransaction) {
    return this.delivery.publish(input, transaction);
  }

  list(recipientUserId: string, query: NotificationQuery) {
    return this.delivery.list(recipientUserId, query);
  }

  unreadCount(recipientUserId: string) {
    return this.delivery.unreadCount(recipientUserId);
  }

  markRead(id: string, recipientUserId: string) {
    return this.delivery.markRead(id, recipientUserId);
  }

  markAllRead(recipientUserId: string) {
    return this.delivery.markAllRead(recipientUserId);
  }

  archive(id: string, recipientUserId: string) {
    return this.delivery.archive(id, recipientUserId);
  }

  createAnnouncement(input: CreateAnnouncementRequest, actor: ActorContext) {
    return this.announcements.create(input, actor);
  }

  updateAnnouncement(id: string, input: UpdateAnnouncementRequest, actor: ActorContext) {
    return this.announcements.update(id, input, actor);
  }

  publishAnnouncement(id: string, expectedRevision: number, actor: ActorContext) {
    return this.announcements.publish(id, expectedRevision, actor);
  }

  withdrawAnnouncement(id: string, expectedRevision: number, actor: ActorContext) {
    return this.announcements.withdraw(id, expectedRevision, actor);
  }

  listAnnouncements(query: AnnouncementQuery) {
    return this.announcements.list(query);
  }

  getAnnouncement(id: string) {
    return this.announcements.get(id);
  }

  processAnnouncement(id: string, signal: AbortSignal) {
    return this.announcements.process(id, signal);
  }
}
