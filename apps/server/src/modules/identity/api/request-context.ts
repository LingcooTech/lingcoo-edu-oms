import type { ResolvedIdentitySession } from '../domain/model.js';

export interface IdentityPrincipal extends ResolvedIdentitySession {
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    identityPrincipal: IdentityPrincipal | null;
  }
}
