import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { AuditChange } from '@lingcoo-edu-oms/contracts';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    eventVersion: integer('event_version').notNull().default(1),
    redactionVersion: integer('redaction_version').notNull().default(1),
    category: varchar('category', { length: 20 }).notNull(),
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    actorId: varchar('actor_id', { length: 200 }),
    actorLabel: varchar('actor_label', { length: 200 }),
    action: varchar('action', { length: 120 }).notNull(),
    resourceType: varchar('resource_type', { length: 120 }).notNull(),
    resourceId: varchar('resource_id', { length: 200 }),
    outcome: varchar('outcome', { length: 20 }).notNull().default('success'),
    requestId: varchar('request_id', { length: 200 }),
    correlationId: varchar('correlation_id', { length: 200 }),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    changes: jsonb('changes').$type<AuditChange[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    check(
      'audit_events_actor_type_check',
      sql`${table.actorType} in ('user', 'system', 'job', 'provider')`,
    ),
    check('audit_events_outcome_check', sql`${table.outcome} in ('success', 'failure')`),
    check(
      'audit_events_category_check',
      sql`${table.category} in ('security', 'access', 'account', 'system', 'business')`,
    ),
    index('audit_events_occurred_at_idx').on(table.occurredAt),
    index('audit_events_actor_idx').on(table.actorType, table.actorId, table.occurredAt),
    index('audit_events_action_idx').on(table.action, table.occurredAt),
    index('audit_events_resource_idx').on(table.resourceType, table.resourceId, table.occurredAt),
    index('audit_events_request_id_idx').on(table.requestId),
    index('audit_events_correlation_id_idx').on(table.correlationId),
    index('audit_events_category_idx').on(table.category, table.occurredAt),
  ],
);
