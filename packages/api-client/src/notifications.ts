import {
  announcementDetailSchema,
  announcementPageSchema,
  announcementQuerySchema,
  announcementSummarySchema,
  createAnnouncementRequestSchema,
  markAllNotificationsReadResultSchema,
  notificationPageSchema,
  notificationQuerySchema,
  notificationSchema,
  transitionAnnouncementRequestSchema,
  unreadNotificationCountSchema,
  updateAnnouncementRequestSchema,
  type AnnouncementQuery,
  type CreateAnnouncementRequest,
  type NotificationQuery,
  type TransitionAnnouncementRequest,
  type UpdateAnnouncementRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createNotificationsApi(client: ApiClient) {
  return {
    list(input: Partial<NotificationQuery> = {}) {
      const query = notificationQuerySchema.parse(input);
      return client.request({
        path: `/api/notifications?${queryString(query)}`,
        schema: notificationPageSchema,
      });
    },
    unreadCount() {
      return client.request({
        path: '/api/notifications/unread-count',
        schema: unreadNotificationCountSchema,
      });
    },
    markRead(id: string) {
      return client.request({
        path: `/api/notifications/${encodeURIComponent(id)}/actions/read`,
        method: 'POST',
        schema: notificationSchema,
      });
    },
    markAllRead() {
      return client.request({
        path: '/api/notifications/actions/read-all',
        method: 'POST',
        schema: markAllNotificationsReadResultSchema,
      });
    },
    archive(id: string) {
      return client.request({
        path: `/api/notifications/${encodeURIComponent(id)}/actions/archive`,
        method: 'POST',
        schema: notificationSchema,
      });
    },
    listAnnouncements(input: Partial<AnnouncementQuery> = {}) {
      const query = announcementQuerySchema.parse(input);
      return client.request({
        path: `/api/notifications/announcements?${queryString(query)}`,
        schema: announcementPageSchema,
      });
    },
    getAnnouncement(id: string) {
      return client.request({
        path: `/api/notifications/announcements/${encodeURIComponent(id)}`,
        schema: announcementDetailSchema,
      });
    },
    createAnnouncement(input: CreateAnnouncementRequest) {
      return client.request({
        path: '/api/notifications/announcements',
        method: 'POST',
        body: createAnnouncementRequestSchema.parse(input),
        schema: announcementSummarySchema,
      });
    },
    updateAnnouncement(id: string, input: UpdateAnnouncementRequest) {
      return client.request({
        path: `/api/notifications/announcements/${encodeURIComponent(id)}`,
        method: 'PUT',
        body: updateAnnouncementRequestSchema.parse(input),
        schema: announcementSummarySchema,
      });
    },
    publishAnnouncement(id: string, input: TransitionAnnouncementRequest) {
      return client.request({
        path: `/api/notifications/announcements/${encodeURIComponent(id)}/actions/publish`,
        method: 'POST',
        body: transitionAnnouncementRequestSchema.parse(input),
        schema: announcementSummarySchema,
      });
    },
    withdrawAnnouncement(id: string, input: TransitionAnnouncementRequest) {
      return client.request({
        path: `/api/notifications/announcements/${encodeURIComponent(id)}/actions/withdraw`,
        method: 'POST',
        body: transitionAnnouncementRequestSchema.parse(input),
        schema: announcementSummarySchema,
      });
    },
  };
}

export type NotificationsApi = ReturnType<typeof createNotificationsApi>;
