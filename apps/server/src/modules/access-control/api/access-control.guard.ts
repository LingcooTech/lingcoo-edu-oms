import { ApiError } from '@lingcoo-tech/http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppEnvironment } from '../../../config/environment.js';
import type { IdentityService } from '../../identity/public.js';
import type { AccessControlService } from '../application/access-control.service.js';
import './request-context.js';

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function isProtectedPath(url: string): boolean {
  return url.startsWith('/api/') || url.startsWith('/health/');
}

function isApiDocs(url: string): boolean {
  return url === '/api/docs' || url.startsWith('/api/docs/');
}

export function installAccessControlGuard(
  app: FastifyInstance,
  dependencies: {
    environment: AppEnvironment;
    identity: IdentityService;
    access: AccessControlService;
  },
): void {
  app.decorateRequest('identityPrincipal', null);
  app.decorateRequest('accessPermissions', null);
  app.decorateRequest('educationScope', null);

  app.addHook('preHandler', async (request) => {
    if (!isProtectedPath(request.url) || isApiDocs(request.url)) return;
    const policy = request.routeOptions.config.access;
    if (!policy) {
      throw new ApiError(403, 'ACCESS_POLICY_REQUIRED', '接口未声明访问策略，已默认拒绝');
    }
    if ('public' in policy) return;

    const authTransport = await authenticate(
      request,
      dependencies.environment,
      dependencies.identity,
    );
    if (authTransport === 'cookie' && isUnsafeMethod(request.method)) {
      validateCsrf(request, dependencies.identity);
    }

    const principal = request.identityPrincipal!;
    const passwordChangeRoutes = new Set([
      'GET /api/auth/me',
      'HEAD /api/auth/me',
      'POST /api/auth/logout',
      'POST /api/auth/password/change',
    ]);
    if (
      principal.user.mustChangePassword &&
      !passwordChangeRoutes.has(`${request.method} ${request.routeOptions.url}`)
    ) {
      throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改密码');
    }
    if ('authenticated' in policy) return;

    const permissions = await dependencies.access.permissionsForUser(principal.user.id);
    request.accessPermissions = permissions;
    const granted = new Set(permissions);
    if (
      policy.permissions.some((permission) => permission.startsWith('education.')) &&
      !policy.education &&
      !policy.allowUnscopedEducation
    ) {
      throw new ApiError(403, 'ACCESS_SCOPE_REQUIRED', '教务接口必须声明数据访问范围');
    }
    if (policy.education) {
      const institutionId = z
        .uuid()
        .safeParse((request.params as Record<string, unknown>)[policy.education.institutionParam]);
      if (!institutionId.success)
        throw new ApiError(403, 'ACCESS_SCOPE_DENIED', '缺少有效机构范围');
      request.educationScope = await dependencies.access.resolveEducationScope({
        userId: principal.user.id,
        institutionId: institutionId.data,
        permission: policy.education.permission,
        capability: policy.education.capability,
      });
      // Capabilities can grant this one scoped operation; they never become global permissions.
      granted.add(policy.education.permission);
    }
    if (!policy.permissions.every((permission) => granted.has(permission))) {
      throw new ApiError(403, 'ACCESS_PERMISSION_DENIED', '当前账号没有执行此操作所需的权限');
    }
  });
}

async function authenticate(
  request: FastifyRequest,
  environment: AppEnvironment,
  identity: IdentityService,
): Promise<'cookie' | 'bearer'> {
  const cookieSessionToken = request.cookies[environment.AUTH_COOKIE_NAME];
  const cookieCsrfToken = request.cookies[environment.AUTH_CSRF_COOKIE_NAME];
  const authorization = firstHeader(request.headers.authorization);
  const bearerSessionToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const bearerCsrfToken = firstHeader(request.headers['x-csrf-token']);
  const transport = cookieSessionToken && cookieCsrfToken ? 'cookie' : 'bearer';
  const sessionToken = transport === 'cookie' ? cookieSessionToken : bearerSessionToken;
  const csrfToken = transport === 'cookie' ? cookieCsrfToken : bearerCsrfToken;
  if (!sessionToken || !csrfToken) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', '请先登录');
  }
  const session = await identity.resolveSession(sessionToken, csrfToken);
  if (!session) throw new ApiError(401, 'INVALID_SESSION', '登录状态已失效');
  request.identityPrincipal = { ...session, csrfToken };
  return transport;
}

function validateCsrf(request: FastifyRequest, identity: IdentityService): void {
  const principal = request.identityPrincipal!;
  const header = firstHeader(request.headers['x-csrf-token']);
  if (!header || !identity.csrfMatches(header, principal.csrfToken)) {
    throw new ApiError(403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌无效');
  }
}
