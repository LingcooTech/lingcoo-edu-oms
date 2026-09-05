import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnnouncementQuery,
  CreateAnnouncementRequest,
  NotificationQuery,
  UpdateAnnouncementRequest,
} from '@lingcoo-edu-oms/contracts';

import { notificationsApi } from './api';

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: (query: Partial<NotificationQuery>) => ['notifications', 'list', query] as const,
  unread: ['notifications', 'unread'] as const,
  announcements: (query: Partial<AnnouncementQuery>) =>
    ['notifications', 'announcements', query] as const,
};

export function useNotifications(query: Partial<NotificationQuery>) {
  return useQuery({
    queryKey: notificationQueryKeys.list(query),
    queryFn: () => notificationsApi.list(query),
  });
}
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationQueryKeys.unread,
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30_000,
  });
}
function useRefreshNotifications() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: notificationQueryKeys.all });
}
export function useMarkNotificationRead() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: refresh,
  });
}
export function useMarkAllNotificationsRead() {
  const refresh = useRefreshNotifications();
  return useMutation({ mutationFn: () => notificationsApi.markAllRead(), onSuccess: refresh });
}
export function useArchiveNotification() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.archive(id),
    onSuccess: refresh,
  });
}
export function useAnnouncements(query: Partial<AnnouncementQuery>) {
  return useQuery({
    queryKey: notificationQueryKeys.announcements(query),
    queryFn: () => notificationsApi.listAnnouncements(query),
    refetchInterval: 5_000,
  });
}
export function useCreateAnnouncement() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: (input: CreateAnnouncementRequest) => notificationsApi.createAnnouncement(input),
    onSuccess: refresh,
  });
}
export function useUpdateAnnouncement() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAnnouncementRequest }) =>
      notificationsApi.updateAnnouncement(id, input),
    onSuccess: refresh,
  });
}
export function usePublishAnnouncement() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      notificationsApi.publishAnnouncement(id, { expectedRevision: revision }),
    onSuccess: refresh,
  });
}
export function useWithdrawAnnouncement() {
  const refresh = useRefreshNotifications();
  return useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      notificationsApi.withdrawAnnouncement(id, { expectedRevision: revision }),
    onSuccess: refresh,
  });
}
