import type { MailDeliveryQuery } from '@lingcoo-edu-oms/contracts';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { mailDeliveries, mailTemplateOverrides } from './mail.schema.js';

export class MailRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async insertDelivery(input: typeof mailDeliveries.$inferInsert, executor: DatabaseTransaction) {
    const [record] = await executor
      .insert(mailDeliveries)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return record ?? null;
  }

  async findDeliveryByDeduplication(hash: string, executor: DatabaseExecutor) {
    const [record] = await executor
      .select()
      .from(mailDeliveries)
      .where(eq(mailDeliveries.deduplicationHash, hash))
      .limit(1);
    return record ?? null;
  }

  async bindJob(id: string, jobId: string, executor: DatabaseTransaction) {
    const [record] = await executor
      .update(mailDeliveries)
      .set({ jobId, updatedAt: new Date() })
      .where(
        and(
          eq(mailDeliveries.id, id),
          or(eq(mailDeliveries.jobId, jobId), isNull(mailDeliveries.jobId)),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findDelivery(id: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(mailDeliveries)
      .where(eq(mailDeliveries.id, id))
      .limit(1);
    return record ?? null;
  }

  async markSending(id: string, attemptCount: number) {
    const [record] = await this.database.db
      .update(mailDeliveries)
      .set({
        status: 'sending',
        attemptCount,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorStatus: null,
        lastErrorRetryable: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mailDeliveries.id, id),
          or(
            eq(mailDeliveries.status, 'queued'),
            eq(mailDeliveries.status, 'exhausted'),
            eq(mailDeliveries.status, 'sending'),
          ),
        ),
      )
      .returning();
    return record ?? null;
  }

  async markSent(
    id: string,
    input: { transport: string; simulated: boolean; providerMessageId: string | null },
  ) {
    const now = new Date();
    const [record] = await this.database.db
      .update(mailDeliveries)
      .set({
        status: 'sent',
        transport: input.transport,
        simulated: input.simulated,
        providerMessageId: input.providerMessageId,
        sentAt: now,
        updatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorStatus: null,
        lastErrorRetryable: null,
      })
      .where(and(eq(mailDeliveries.id, id), eq(mailDeliveries.status, 'sending')))
      .returning();
    return record ?? null;
  }

  async markFailed(
    id: string,
    failure: { code: string; message: string; statusCode: number; retryable: boolean },
    exhausted: boolean,
  ) {
    const [record] = await this.database.db
      .update(mailDeliveries)
      .set({
        status: exhausted ? 'exhausted' : 'queued',
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
        lastErrorStatus: failure.statusCode,
        lastErrorRetryable: failure.retryable,
        updatedAt: new Date(),
      })
      .where(and(eq(mailDeliveries.id, id), eq(mailDeliveries.status, 'sending')))
      .returning();
    return record ?? null;
  }

  listOverrides(executor: DatabaseExecutor = this.database.db) {
    return executor.select().from(mailTemplateOverrides).orderBy(mailTemplateOverrides.key);
  }

  async findOverride(key: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(mailTemplateOverrides)
      .where(eq(mailTemplateOverrides.key, key))
      .limit(1);
    return record ?? null;
  }

  async saveOverride(
    key: string,
    input: {
      subjectTemplate: string;
      textTemplate: string;
      expectedRevision: number | null;
      actorId: string;
    },
    executor: DatabaseTransaction,
  ) {
    const now = new Date();
    if (input.expectedRevision === null) {
      const [created] = await executor
        .insert(mailTemplateOverrides)
        .values({
          key,
          subjectTemplate: input.subjectTemplate,
          textTemplate: input.textTemplate,
          revision: 1,
          updatedBy: input.actorId,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      return created ?? null;
    }
    const [updated] = await executor
      .update(mailTemplateOverrides)
      .set({
        subjectTemplate: input.subjectTemplate,
        textTemplate: input.textTemplate,
        revision: input.expectedRevision + 1,
        updatedBy: input.actorId,
        updatedAt: now,
      })
      .where(
        and(
          eq(mailTemplateOverrides.key, key),
          eq(mailTemplateOverrides.revision, input.expectedRevision),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async deleteOverride(key: string, revision: number, executor: DatabaseTransaction) {
    const [removed] = await executor
      .delete(mailTemplateOverrides)
      .where(and(eq(mailTemplateOverrides.key, key), eq(mailTemplateOverrides.revision, revision)))
      .returning();
    return removed ?? null;
  }

  async search(query: MailDeliveryQuery) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(mailDeliveries.status, query.status));
    if (query.templateKey) filters.push(eq(mailDeliveries.templateKey, query.templateKey));
    if (query.from) filters.push(gte(mailDeliveries.createdAt, new Date(query.from)));
    if (query.to) filters.push(lte(mailDeliveries.createdAt, new Date(query.to)));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const filter = or(
        ilike(mailDeliveries.templateKey, pattern),
        ilike(mailDeliveries.recipientPreview, pattern),
        ilike(mailDeliveries.lastErrorCode, pattern),
      );
      if (filter) filters.push(filter);
    }
    const where = filters.length ? and(...filters) : undefined;
    const [items, [total]] = await Promise.all([
      this.database.db
        .select()
        .from(mailDeliveries)
        .where(where)
        .orderBy(desc(mailDeliveries.createdAt), desc(mailDeliveries.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.db.select({ value: count() }).from(mailDeliveries).where(where),
    ]);
    return { items, total: total?.value ?? 0 };
  }

  async purgeTerminal(before: Date, limit: number, executor: DatabaseTransaction) {
    const candidates = await executor
      .select({ id: mailDeliveries.id })
      .from(mailDeliveries)
      .where(
        and(
          inArray(mailDeliveries.status, ['sent', 'exhausted']),
          lt(mailDeliveries.updatedAt, before),
        ),
      )
      .orderBy(asc(mailDeliveries.updatedAt), asc(mailDeliveries.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (!candidates.length) return 0;
    const removed = await executor
      .delete(mailDeliveries)
      .where(or(...candidates.map((candidate) => eq(mailDeliveries.id, candidate.id))))
      .returning({ id: mailDeliveries.id });
    return removed.length;
  }
}
