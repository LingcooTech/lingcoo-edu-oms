import { ApiError } from '@lingcoo-tech/http';
import type { AuditQuery } from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor } from '../../../database/database.js';
import type { AuditEventInput, AuditWriter } from '../domain/model.js';
import { redactAuditChanges, redactAuditMetadata } from '../domain/redact-metadata.js';
import type { AuditRepository } from '../infrastructure/persistence/audit.repository.js';

export class AuditService implements AuditWriter {
  constructor(private readonly repository: AuditRepository) {}

  async record(event: AuditEventInput, executor?: DatabaseExecutor): Promise<void> {
    await this.repository.append(
      {
        ...event,
        changes: redactAuditChanges(event.changes ?? []),
        metadata: redactAuditMetadata(event.metadata),
      },
      executor,
    );
  }

  async list(query: AuditQuery) {
    const result = await this.repository.search(query);
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string) {
    const event = await this.repository.findById(id);
    if (!event) throw new ApiError(404, 'AUDIT_EVENT_NOT_FOUND', '审计事件不存在');
    return event;
  }
}
