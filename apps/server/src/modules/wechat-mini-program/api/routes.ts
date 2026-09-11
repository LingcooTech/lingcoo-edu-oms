import { ApiError } from '@lingcoo-tech/http';
import {
  wechatMiniBindPhoneRequestSchema,
  wechatMiniLoginRequestSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { auditContextFromRequest } from '../../audit/public.js';
import type { WechatMiniAuthService } from '../application/wechat-mini-auth.service.js';
import '../../access-control/api/request-context.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

export async function registerWechatMiniAuthRoutes(
  app: FastifyInstance,
  service: WechatMiniAuthService,
): Promise<void> {
  const loginRateLimit = app.rateLimit({ max: 30, timeWindow: '1 minute' });
  const bindRateLimit = app.rateLimit({ max: 15, timeWindow: '1 minute' });

  app.post(
    '/api/mini/auth/wechat/login',
    { config: { access: { public: true } }, preHandler: loginRateLimit },
    async (request) =>
      service.login(
        parse(wechatMiniLoginRequestSchema, request.body),
        auditContextFromRequest(request, { type: 'user' }),
      ),
  );

  app.post(
    '/api/mini/auth/wechat/bind-phone',
    { config: { access: { public: true } }, preHandler: bindRateLimit },
    async (request) =>
      service.bindPhone(
        parse(wechatMiniBindPhoneRequestSchema, request.body),
        auditContextFromRequest(request, { type: 'user' }),
      ),
  );
}
