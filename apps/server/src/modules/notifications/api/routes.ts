import { ApiError } from '@lingcoo-tech/http';
import {
  announcementQuerySchema,
  createAnnouncementRequestSchema,
  notificationQuerySchema,
  transitionAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { NotificationsService } from '../application/notifications.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  return result.data;
}
function userId(request: Parameters<typeof auditContextFromRequest>[0]) {
  return request.identityPrincipal!.user.id;
}
function actor(request: Parameters<typeof auditContextFromRequest>[0]) {
  const user = request.identityPrincipal!.user;
  return {
    ...auditContextFromRequest(request, {
      type: 'user' as const,
      id: user.id,
      label: user.displayName ?? user.email ?? user.phone,
    }),
    actorId: user.id,
  };
}

export async function registerNotificationRoutes(
  app: FastifyInstance,
  service: NotificationsService,
) {
  app.get('/api/notifications', { config: { access: { permissions: [] } } }, async (request) =>
    service.list(userId(request), parse(notificationQuerySchema, request.query)),
  );
  app.get(
    '/api/notifications/unread-count',
    { config: { access: { permissions: [] } } },
    async (request) => service.unreadCount(userId(request)),
  );
  app.post(
    '/api/notifications/actions/read-all',
    { config: { access: { permissions: [] } } },
    async (request) => service.markAllRead(userId(request)),
  );
  app.post(
    '/api/notifications/:id/actions/read',
    { config: { access: { permissions: [] } } },
    async (request) => service.markRead(parse(idParamsSchema, request.params).id, userId(request)),
  );
  app.post(
    '/api/notifications/:id/actions/archive',
    { config: { access: { permissions: [] } } },
    async (request) => service.archive(parse(idParamsSchema, request.params).id, userId(request)),
  );

  app.get(
    '/api/notifications/announcements',
    { config: { access: { permissions: ['notifications.read'] } } },
    async (request) => service.listAnnouncements(parse(announcementQuerySchema, request.query)),
  );
  app.get(
    '/api/notifications/announcements/:id',
    { config: { access: { permissions: ['notifications.read'] } } },
    async (request) => service.getAnnouncement(parse(idParamsSchema, request.params).id),
  );
  app.post(
    '/api/notifications/announcements',
    { config: { access: { permissions: ['notifications.manage'] } } },
    async (request) =>
      service.createAnnouncement(
        parse(createAnnouncementRequestSchema, request.body),
        actor(request),
      ),
  );
  app.put(
    '/api/notifications/announcements/:id',
    { config: { access: { permissions: ['notifications.manage'] } } },
    async (request) =>
      service.updateAnnouncement(
        parse(idParamsSchema, request.params).id,
        parse(updateAnnouncementRequestSchema, request.body),
        actor(request),
      ),
  );
  app.post(
    '/api/notifications/announcements/:id/actions/publish',
    { config: { access: { permissions: ['notifications.manage'] } } },
    async (request) =>
      service.publishAnnouncement(
        parse(idParamsSchema, request.params).id,
        parse(transitionAnnouncementRequestSchema, request.body).expectedRevision,
        actor(request),
      ),
  );
  app.post(
    '/api/notifications/announcements/:id/actions/withdraw',
    { config: { access: { permissions: ['notifications.manage'] } } },
    async (request) =>
      service.withdrawAnnouncement(
        parse(idParamsSchema, request.params).id,
        parse(transitionAnnouncementRequestSchema, request.body).expectedRevision,
        actor(request),
      ),
  );
}
