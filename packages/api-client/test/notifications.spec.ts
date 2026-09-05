import { describe, expect, it, vi } from 'vitest';

import { createNotificationsApi } from '../src/notifications.js';

const id = '2f54dd84-ca70-4d17-bf80-ffaca336113c';

describe('notifications API client', () => {
  it('builds self-service notification requests', async () => {
    const request = vi.fn(async () => ({}));
    const api = createNotificationsApi({ request } as never);

    await api.list({ status: 'unread', search: '系统' });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/\/api\/notifications\?.*status=unread/),
      }),
    );
    await api.markRead(id);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'POST', path: `/api/notifications/${id}/actions/read` }),
    );
    await api.markAllRead();
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/notifications/actions/read-all',
      }),
    );
  });

  it('validates and builds announcement lifecycle requests', async () => {
    const request = vi.fn(async () => ({}));
    const api = createNotificationsApi({ request } as never);
    await api.createAnnouncement({
      title: '系统公告',
      body: '公告正文',
      audience: { type: 'all_active_users' },
      channels: ['in_app'],
      level: 'info',
      deduplicationKey: 'announcement-2026-09-01',
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/api/notifications/announcements',
        body: expect.objectContaining({ title: '系统公告' }),
      }),
    );
    await api.publishAnnouncement(id, { expectedRevision: 2 });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: `/api/notifications/announcements/${id}/actions/publish`,
        body: { expectedRevision: 2 },
      }),
    );
  });
});
