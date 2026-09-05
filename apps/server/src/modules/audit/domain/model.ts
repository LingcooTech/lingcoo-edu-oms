import type {
  AuditActorType,
  AuditCategory,
  AuditChange,
  AuditOutcome,
  AuditQuery,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor } from '../../../database/database.js';

export interface AuditContext {
  actorType: AuditActorType;
  actorId?: string | null;
  actorLabel?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEventInput extends AuditContext {
  eventVersion?: number;
  category: AuditCategory;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  changes?: AuditChange[];
  metadata?: Record<string, unknown>;
}

export interface AuditWriter {
  record(event: AuditEventInput, executor?: DatabaseExecutor): Promise<void>;
}

export type AuditSearch = AuditQuery;

export const NOOP_AUDIT_WRITER: AuditWriter = {
  async record() {},
};
