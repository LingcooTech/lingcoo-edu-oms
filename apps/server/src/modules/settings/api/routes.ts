import { ApiError } from '@lingcoo-tech/http';
import {
  clearSettingRequestSchema,
  saveSettingRequestSchema,
  settingKeySchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { SettingsService } from '../application/settings.service.js';

const keyParamsSchema = z.object({ key: settingKeySchema });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function actorContext(request: Parameters<typeof auditContextFromRequest>[0]) {
  const user = request.identityPrincipal!.user;
  return {
    ...auditContextFromRequest(request, {
      type: 'user',
      id: user.id,
      label: user.displayName ?? user.email ?? user.phone,
    }),
    actorId: user.id,
  };
}

export async function registerSettingsRoutes(
  app: FastifyInstance,
  service: SettingsService,
): Promise<void> {
  app.get('/api/settings/public', { config: { access: { public: true } } }, async () => ({
    values: await service.publicValues(),
  }));

  app.get('/api/settings', { config: { access: { permissions: ['settings.read'] } } }, async () =>
    service.list(),
  );

  app.put(
    '/api/settings/:key',
    { config: { access: { permissions: ['settings.manage'] } } },
    async (request) => {
      const { key } = parse(keyParamsSchema, request.params);
      return service.save(
        key,
        parse(saveSettingRequestSchema, request.body),
        actorContext(request),
      );
    },
  );

  app.delete(
    '/api/settings/:key',
    { config: { access: { permissions: ['settings.manage'] } } },
    async (request) => {
      const { key } = parse(keyParamsSchema, request.params);
      return service.clear(
        key,
        parse(clearSettingRequestSchema, request.body),
        actorContext(request),
      );
    },
  );

  app.post(
    '/api/settings/tests/:key',
    { config: { access: { permissions: ['settings.manage'] } } },
    async (request, reply) => {
      const { key } = parse(keyParamsSchema, request.params);
      const controller = new AbortController();
      const abort = () => controller.abort();
      reply.raw.once('close', abort);
      try {
        return await service.testConnection(key, actorContext(request), controller.signal);
      } finally {
        reply.raw.off('close', abort);
      }
    },
  );

  app.post(
    '/api/settings/actions/rotate-secrets',
    { config: { access: { permissions: ['settings.manage'] } } },
    async (request) => service.rotateSecrets(actorContext(request)),
  );
}
