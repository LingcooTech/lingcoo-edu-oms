import type { AuditQuery } from '@lingcoo-edu-oms/contracts';
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor, DatabaseHandle } from '../../../../database/database.js';
import type { AuditEventInput } from '../../domain/model.js';
import { auditEvents } from './audit.schema.js';

export class AuditRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async append(
    event: AuditEventInput,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    const [record] = await executor
      .insert(auditEvents)
      .values({
        actorType: event.actorType,
        eventVersion: event.eventVersion ?? 1,
        redactionVersion: 1,
        category: event.category,
        actorId: event.actorId ?? null,
        actorLabel: event.actorLabel ?? null,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId ?? null,
        outcome: event.outcome ?? 'success',
        requestId: event.requestId ?? null,
        correlationId: event.correlationId ?? null,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        changes: event.changes ?? [],
        metadata: event.metadata ?? {},
      })
      .returning({ id: auditEvents.id });
    if (!record) throw new Error('Failed to append audit event');
  }

  async findById(id: string) {
    const [record] = await this.database.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.id, id))
      .limit(1);
    return record ?? null;
  }

  async search(query: AuditQuery) {
    const filters: SQL[] = [];
    if (query.actorType) filters.push(eq(auditEvents.actorType, query.actorType));
    if (query.category) filters.push(eq(auditEvents.category, query.category));
    if (query.actorId) filters.push(eq(auditEvents.actorId, query.actorId));
    if (query.action) filters.push(eq(auditEvents.action, query.action));
    if (query.resourceType) filters.push(eq(auditEvents.resourceType, query.resourceType));
    if (query.resourceId) filters.push(eq(auditEvents.resourceId, query.resourceId));
    if (query.outcome) filters.push(eq(auditEvents.outcome, query.outcome));
    if (query.from) filters.push(gte(auditEvents.occurredAt, new Date(query.from)));
    if (query.to) filters.push(lte(auditEvents.occurredAt, new Date(query.to)));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const search = or(
        ilike(auditEvents.action, pattern),
        ilike(auditEvents.resourceType, pattern),
        ilike(auditEvents.resourceId, pattern),
        ilike(auditEvents.actorId, pattern),
        ilike(auditEvents.actorLabel, pattern),
        ilike(auditEvents.requestId, pattern),
      );
      if (search) filters.push(search);
    }
    const where = filters.length > 0 ? and(...filters) : undefined;
    const [items, [total]] = await Promise.all([
      this.database.db
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(auditEvents).where(where),
    ]);
    return { items, total: total?.value ?? 0 };
  }
}
