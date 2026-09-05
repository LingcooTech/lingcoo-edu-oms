import type { FastifyRequest } from 'fastify';

import type { AuditActorType } from '@lingcoo-edu-oms/contracts';
import type { AuditContext } from '../domain/model.js';

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function auditContextFromRequest(
  request: FastifyRequest,
  actor: { type: AuditActorType; id?: string | null; label?: string | null },
): AuditContext {
  return {
    actorType: actor.type,
    actorId: actor.id ?? null,
    actorLabel: actor.label?.slice(0, 200) ?? null,
    requestId: request.id.slice(0, 200),
    ipAddress: request.ip?.slice(0, 64) ?? null,
    userAgent: firstHeader(request.headers['user-agent'])?.slice(0, 512) ?? null,
  };
}
