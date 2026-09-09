import type { CookieSerializeOptions } from '@fastify/cookie';
import { ApiError } from '@lingcoo-tech/http';
import {
  changePasswordRequestSchema,
  confirmEmailVerificationSchema,
  confirmPasswordResetSchema,
  loginRequestSchema,
  requestPasswordResetSchema,
} from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { AppEnvironment } from '../../../config/environment.js';
import { auditContextFromRequest } from '../../audit/public.js';
import type { IdentityService } from '../application/identity.service.js';
import type { PublicIdentitySession, PublicIdentityUser } from '../domain/model.js';
import './request-context.js';

interface IdentityRouteDependencies {
  environment: AppEnvironment;
  service: IdentityService;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '请求参数校验失败', z.flattenError(result.error));
  }
  return result.data;
}

function serializeUser(user: PublicIdentityUser) {
  return {
    ...user,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

function serializeSession(session: PublicIdentitySession) {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function registerIdentityRoutes(
  app: FastifyInstance,
  dependencies: IdentityRouteDependencies,
): Promise<void> {
  const { environment, service } = dependencies;
  const cookieOptions = (httpOnly: boolean): CookieSerializeOptions => ({
    httpOnly,
    sameSite: environment.AUTH_COOKIE_SAME_SITE,
    secure: environment.AUTH_COOKIE_SECURE,
    path: '/',
    maxAge: environment.AUTH_SESSION_TTL_SECONDS,
  });
  const clearCookies = (reply: FastifyReply): void => {
    reply.clearCookie(environment.AUTH_COOKIE_NAME, cookieOptions(true));
    reply.clearCookie(environment.AUTH_CSRF_COOKIE_NAME, cookieOptions(false));
  };
  const loginRateLimit = app.rateLimit({
    max: 10,
    timeWindow: '1 minute',
  });
  const passwordResetRequestRateLimit = app.rateLimit({
    max: 5,
    timeWindow: '1 minute',
  });
  const passwordResetConfirmRateLimit = app.rateLimit({
    max: 10,
    timeWindow: '1 minute',
  });
  const emailVerificationRequestRateLimit = app.rateLimit({
    max: 5,
    timeWindow: '1 minute',
  });
  const emailVerificationConfirmRateLimit = app.rateLimit({
    max: 10,
    timeWindow: '1 minute',
  });

  app.post(
    '/api/auth/login',
    { config: { access: { public: true } }, preHandler: loginRateLimit },
    async (request, reply) => {
      const input = parse(loginRequestSchema, request.body);
      const result = await service.login(
        input,
        auditContextFromRequest(request, { type: 'user', label: input.identifier ?? input.email }),
      );
      reply.setCookie(environment.AUTH_COOKIE_NAME, result.sessionToken, cookieOptions(true));
      reply.setCookie(environment.AUTH_CSRF_COOKIE_NAME, result.csrfToken, cookieOptions(false));
      return {
        user: serializeUser(result.user),
        session: { id: result.sessionId, expiresAt: result.expiresAt.toISOString() },
        csrfToken: result.csrfToken,
      };
    },
  );

  app.post(
    '/api/auth/native/login',
    { config: { access: { public: true } }, preHandler: loginRateLimit },
    async (request) => {
      const input = parse(loginRequestSchema, request.body);
      const result = await service.login(
        input,
        auditContextFromRequest(request, { type: 'user', label: input.identifier ?? input.email }),
      );
      return {
        user: serializeUser(result.user),
        session: { id: result.sessionId, expiresAt: result.expiresAt.toISOString() },
        csrfToken: result.csrfToken,
        accessToken: result.sessionToken,
      };
    },
  );

  app.get('/api/auth/me', { config: { access: { permissions: [] } } }, async (request) => {
    const principal = request.identityPrincipal!;
    return {
      user: serializeUser(principal.user),
      session: { id: principal.sessionId, expiresAt: principal.expiresAt.toISOString() },
      csrfToken: principal.csrfToken,
    };
  });

  app.post(
    '/api/auth/logout',
    { config: { access: { permissions: [] } } },
    async (request, reply) => {
      const principal = request.identityPrincipal!;
      await service.logout(
        principal.user.id,
        principal.sessionId,
        auditContextFromRequest(request, {
          type: 'user',
          id: principal.user.id,
          label: principal.user.displayName ?? principal.user.email ?? principal.user.phone,
        }),
      );
      clearCookies(reply);
      return { accepted: true } as const;
    },
  );

  app.post(
    '/api/auth/password/change',
    { config: { access: { permissions: [] } } },
    async (request, reply) => {
      const input = parse(changePasswordRequestSchema, request.body);
      const principal = request.identityPrincipal!;
      await service.changePassword(
        principal.user.id,
        input,
        auditContextFromRequest(request, {
          type: 'user',
          id: principal.user.id,
          label: principal.user.displayName ?? principal.user.email ?? principal.user.phone,
        }),
      );
      clearCookies(reply);
      return { accepted: true } as const;
    },
  );

  app.post(
    '/api/auth/password-reset/request',
    { config: { access: { public: true } }, preHandler: passwordResetRequestRateLimit },
    async (request) => {
      const input = parse(requestPasswordResetSchema, request.body);
      return service.requestPasswordReset(
        input.email,
        auditContextFromRequest(request, { type: 'user', label: input.email }),
      );
    },
  );

  app.post(
    '/api/auth/password-reset/confirm',
    { config: { access: { public: true } }, preHandler: passwordResetConfirmRateLimit },
    async (request) => {
      await service.confirmPasswordReset(
        parse(confirmPasswordResetSchema, request.body),
        auditContextFromRequest(request, { type: 'user' }),
      );
      return { accepted: true } as const;
    },
  );

  app.post(
    '/api/auth/email-verification/request',
    {
      config: { access: { permissions: [] } },
      preHandler: emailVerificationRequestRateLimit,
    },
    async (request) => {
      const principal = request.identityPrincipal!;
      return service.requestEmailVerification(
        principal.user.id,
        auditContextFromRequest(request, {
          type: 'user',
          id: principal.user.id,
          label: principal.user.displayName ?? principal.user.email ?? principal.user.phone,
        }),
      );
    },
  );

  app.post(
    '/api/auth/email-verification/confirm',
    { config: { access: { public: true } }, preHandler: emailVerificationConfirmRateLimit },
    async (request) => {
      const input = parse(confirmEmailVerificationSchema, request.body);
      await service.confirmEmailVerification(
        input.token,
        auditContextFromRequest(request, { type: 'user' }),
      );
      return { accepted: true } as const;
    },
  );

  app.get('/api/auth/sessions', { config: { access: { permissions: [] } } }, async (request) => ({
    items: (
      await service.listSessions(
        request.identityPrincipal!.user.id,
        request.identityPrincipal!.sessionId,
      )
    ).map(serializeSession),
  }));

  app.post(
    '/api/auth/sessions/:sessionId/revoke',
    { config: { access: { permissions: [] } } },
    async (request) => {
      const { sessionId } = parse(z.object({ sessionId: z.uuid() }), request.params);
      const principal = request.identityPrincipal!;
      await service.revokeSession(
        principal.user.id,
        sessionId,
        principal.sessionId,
        auditContextFromRequest(request, {
          type: 'user',
          id: principal.user.id,
          label: principal.user.displayName ?? principal.user.email ?? principal.user.phone,
        }),
      );
      return { accepted: true } as const;
    },
  );
}
