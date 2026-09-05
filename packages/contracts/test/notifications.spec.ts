import { describe, expect, it } from 'vitest';

import {
  announcementDetailSchema,
  createAnnouncementRequestSchema,
  notificationCtaUrlSchema,
  notificationSchema,
} from '../src/notifications.js';

const userId = '2f54dd84-ca70-4d17-bf80-ffaca336113c';
const now = '2026-09-01T00:00:00.000Z';

describe('notifications contracts', () => {
  it('accepts only safe CTA protocols and requires the label/link pair', () => {
    expect(notificationCtaUrlSchema.parse('/notifications')).toBe('/notifications');
    expect(notificationCtaUrlSchema.parse('https://example.com/notices')).toContain('https:');
    expect(() => notificationCtaUrlSchema.parse('//example.com')).toThrow();
    expect(() => notificationCtaUrlSchema.parse('javascript:alert(1)')).toThrow();
    expect(() =>
      createAnnouncementRequestSchema.parse({
        title: '公告',
        body: '正文',
        ctaLabel: '查看',
        audience: { type: 'all_active_users' },
        deduplicationKey: 'announcement-1',
      }),
    ).toThrow();
  });

  it('normalizes selected recipients and strips private persistence fields', () => {
    const request = createAnnouncementRequestSchema.parse({
      title: '公告',
      body: '正文',
      audience: { type: 'selected_users', userIds: [userId, userId] },
      channels: ['in_app', 'in_app'],
      deduplicationKey: 'announcement-2',
    });
    expect(request.audience).toEqual({ type: 'selected_users', userIds: [userId] });
    expect(request.channels).toEqual(['in_app']);

    const notification = notificationSchema.parse({
      id: userId,
      category: 'system.release',
      level: 'info',
      title: '版本发布',
      body: '新版本已经发布。',
      ctaLabel: null,
      ctaUrl: null,
      sourceType: 'release',
      sourceId: 'v1',
      metadata: {},
      status: 'unread',
      readAt: null,
      archivedAt: null,
      createdAt: now,
      deduplicationHash: 'a'.repeat(64),
      mailDeliveryId: userId,
    });
    expect(notification).not.toHaveProperty('deduplicationHash');
    expect(notification).not.toHaveProperty('mailDeliveryId');

    const announcement = announcementDetailSchema.parse({
      id: userId,
      status: 'draft',
      audienceType: 'selected_users',
      audience: { type: 'selected_users', userIds: [userId] },
      channels: ['in_app'],
      level: 'warning',
      title: '公告',
      body: '正文',
      ctaLabel: null,
      ctaUrl: null,
      recipientCount: 1,
      deliveredCount: 0,
      revision: 1,
      createdBy: userId,
      publishedAt: null,
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
      createRequestHash: 'b'.repeat(64),
    });
    expect(announcement).not.toHaveProperty('createRequestHash');
  });
});
