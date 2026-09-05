import type { PermissionKey } from '@lingcoo-edu-oms/contracts';

export type AccessPolicy = { public: true } | { permissions: readonly PermissionKey[] };

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: AccessPolicy;
  }

  interface FastifyRequest {
    accessPermissions: readonly PermissionKey[] | null;
  }
}
