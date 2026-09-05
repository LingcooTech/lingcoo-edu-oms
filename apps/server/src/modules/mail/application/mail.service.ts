import { createHash, randomUUID } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import type {
  MailDeliveryQuery,
  ResetMailTemplateRequest,
  SendTestMailRequest,
  UpdateMailTemplateRequest,
} from '@lingcoo-edu-oms/contracts';
import { emailAddressSchema } from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle, DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { JobsService } from '../../jobs/public.js';
import type { SettingsReader } from '../../settings/public.js';
import type {
  MailFailureSnapshot,
  MailProvider,
  MailQueue,
  QueueMailInput,
} from '../domain/model.js';
import type { MailTemplateRegistry } from '../domain/template.registry.js';
import type { MailCipher } from '../infrastructure/mail-cipher.js';
import type { MailRepository } from '../infrastructure/persistence/mail.repository.js';

type ActorContext = AuditContext & { actorId: string };
const MAX_ATTEMPTS = 5;

export class MailService implements MailQueue {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: MailRepository,
    private readonly templates: MailTemplateRegistry,
    private readonly cipher: MailCipher,
    private readonly jobs: JobsService,
    private readonly provider: MailProvider,
    private readonly settings: SettingsReader,
    private readonly audit: AuditWriter,
  ) {}

  async queue(input: QueueMailInput, transaction: DatabaseTransaction) {
    const definition = this.templates.require(input.templateKey);
    const parsedRecipient = emailAddressSchema.safeParse(input.to);
    if (!parsedRecipient.success)
      throw new ApiError(400, 'MAIL_RECIPIENT_INVALID', '邮件收件地址无效');
    const to = parsedRecipient.data;
    const override = await this.repository.findOverride(input.templateKey, transaction);
    const rendered = this.templates.render(
      input.templateKey,
      input.variables,
      override ?? undefined,
    );
    const encrypted = this.cipher.encrypt({ to, ...rendered });
    const recipientHash = digest(to);
    const contentHash = digest(JSON.stringify({ to, ...rendered }));
    const deduplicationHash = input.deduplicationKey ? digest(input.deduplicationKey) : null;
    const inserted = await this.repository.insertDelivery(
      {
        templateKey: definition.key,
        templateVersion: definition.version,
        templateRevision: override?.revision ?? null,
        recipientHash,
        recipientPreview: maskEmail(to),
        contentHash,
        deduplicationHash,
        encryptedEnvelope: encrypted.encryptedEnvelope,
        encryptionKeyId: encrypted.encryptionKeyId,
      },
      transaction,
    );
    const delivery =
      inserted ??
      (deduplicationHash
        ? await this.repository.findDeliveryByDeduplication(deduplicationHash, transaction)
        : null);
    if (!delivery)
      throw new ApiError(409, 'MAIL_QUEUE_CONFLICT', '邮件投递去重记录正在变化，请稍后重试');
    if (
      !inserted &&
      (delivery.templateKey !== definition.key ||
        delivery.recipientHash !== recipientHash ||
        delivery.contentHash !== contentHash)
    )
      throw new ApiError(409, 'MAIL_DEDUPLICATION_CONFLICT', '相同邮件去重键已用于不同投递内容');
    if (!inserted && !delivery.jobId) {
      if (delivery.status === 'sent' || delivery.status === 'exhausted') {
        return { id: delivery.id, deduplicated: true };
      }
      throw new ApiError(409, 'MAIL_JOB_BIND_MISSING', '邮件投递缺少 Job 绑定，需人工诊断后处理');
    }
    const job = await this.jobs.enqueue(
      {
        type: 'mail.send',
        payload: { deliveryId: delivery.id },
        deduplicationKey: `mail.send:${delivery.id}`,
      },
      transaction,
    );
    const bound = await this.repository.bindJob(delivery.id, job.id, transaction);
    if (!bound || bound.jobId !== job.id)
      throw new ApiError(409, 'MAIL_JOB_BIND_CONFLICT', '邮件投递与 Job 绑定冲突');
    return { id: delivery.id, deduplicated: !inserted };
  }

  async sendDelivery(
    deliveryId: string,
    attemptNumber: number,
    signal: AbortSignal,
  ): Promise<void> {
    const current = await this.repository.findDelivery(deliveryId);
    if (!current) throw new ApiError(404, 'MAIL_DELIVERY_NOT_FOUND', '邮件投递不存在');
    if (current.status === 'sent') return;
    const delivery = await this.repository.markSending(deliveryId, attemptNumber);
    if (!delivery) throw new ApiError(409, 'MAIL_DELIVERY_STATE_CONFLICT', '邮件投递状态正在变化');
    try {
      const envelope = this.cipher.decrypt(delivery.encryptedEnvelope, delivery.encryptionKeyId);
      const result = await this.provider.send({ deliveryId, ...envelope, signal });
      if (
        !(await this.repository.markSent(deliveryId, {
          transport: result.transport,
          simulated: result.simulated,
          providerMessageId: result.messageId,
        }))
      )
        throw new ApiError(409, 'MAIL_DELIVERY_STATE_CONFLICT', '邮件投递状态写回失败');
    } catch (error) {
      const failure = this.classifyFailure(error);
      await this.repository.markFailed(
        deliveryId,
        failure,
        !failure.retryable || attemptNumber >= MAX_ATTEMPTS,
      );
      throw error;
    }
  }

  async sendTest(input: SendTestMailRequest, context: ActorContext) {
    return this.database.transaction(async (transaction) => {
      const applicationName =
        (await this.settings.getValue<string>('application.name')) ?? 'Application';
      const result = await this.queue(
        {
          templateKey: 'system.test',
          to: input.to,
          variables: { applicationName },
          deduplicationKey: `system.test:${context.actorId}:${randomUUID()}`,
        },
        transaction,
      );
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'mail.test.queued',
          resourceType: 'mail.delivery',
          resourceId: result.id,
          metadata: { recipient: maskEmail(input.to), templateKey: 'system.test' },
        },
        transaction,
      );
      return result;
    });
  }

  async listDeliveries(query: MailDeliveryQuery) {
    const result = await this.repository.search(query);
    return {
      items: result.items.map((item) => this.toSummary(item)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async getDelivery(id: string) {
    const item = await this.repository.findDelivery(id);
    if (!item) throw new ApiError(404, 'MAIL_DELIVERY_NOT_FOUND', '邮件投递不存在');
    return {
      ...this.toSummary(item),
      contentHash: item.contentHash,
      providerMessageId: item.providerMessageId,
      lastError:
        item.lastErrorCode &&
        item.lastErrorMessage &&
        item.lastErrorStatus &&
        item.lastErrorRetryable !== null
          ? {
              code: item.lastErrorCode,
              message: item.lastErrorMessage,
              statusCode: item.lastErrorStatus,
              retryable: item.lastErrorRetryable,
            }
          : null,
    };
  }

  async listTemplates() {
    const overrides = new Map(
      (await this.repository.listOverrides()).map((item) => [item.key, item]),
    );
    return {
      items: this.templates
        .list()
        .map((definition) =>
          this.toTemplate(definition.key, overrides.get(definition.key) ?? null),
        ),
    };
  }

  async getTemplate(key: string) {
    return this.toTemplate(key, await this.repository.findOverride(key));
  }

  async updateTemplate(key: string, input: UpdateMailTemplateRequest, context: ActorContext) {
    this.templates.validateOverride(key, input.subjectTemplate, input.textTemplate);
    return this.database.transaction(async (transaction) => {
      const record = await this.repository.saveOverride(
        key,
        { ...input, actorId: context.actorId },
        transaction,
      );
      if (!record)
        throw new ApiError(409, 'MAIL_TEMPLATE_VERSION_CONFLICT', '邮件模板已被其他管理员修改');
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'mail.template.updated',
          resourceType: 'mail.template',
          resourceId: key,
          changes: [{ field: 'revision', before: input.expectedRevision, after: record.revision }],
          metadata: {
            subjectHash: digest(input.subjectTemplate),
            textHash: digest(input.textTemplate),
          },
        },
        transaction,
      );
      return this.toTemplate(key, record);
    });
  }

  async resetTemplate(key: string, input: ResetMailTemplateRequest, context: ActorContext) {
    this.templates.require(key);
    return this.database.transaction(async (transaction) => {
      const removed = await this.repository.deleteOverride(
        key,
        input.expectedRevision,
        transaction,
      );
      if (!removed)
        throw new ApiError(409, 'MAIL_TEMPLATE_VERSION_CONFLICT', '邮件模板已被其他管理员修改');
      await this.audit.record(
        {
          ...context,
          category: 'system',
          action: 'mail.template.reset',
          resourceType: 'mail.template',
          resourceId: key,
          changes: [{ field: 'revision', before: removed.revision, after: null }],
        },
        transaction,
      );
      return this.toTemplate(key, null);
    });
  }

  classifyFailure(error: unknown): MailFailureSnapshot {
    const candidate =
      error && typeof error === 'object' && 'failure' in error
        ? (error as { failure: MailFailureSnapshot }).failure
        : null;
    if (candidate) return candidate;
    if (error instanceof ApiError)
      return {
        code: error.code,
        message: safeMessage(error.message),
        statusCode: error.statusCode,
        retryable:
          error.code === 'MAIL_DELIVERY_STATE_CONFLICT' ||
          error.statusCode === 429 ||
          error.statusCode >= 500,
      };
    return {
      code: 'MAIL_SEND_FAILED',
      message: '邮件发送失败，将按退避策略重试',
      statusCode: 500,
      retryable: true,
    };
  }

  async purgeTerminal(retentionDays: number): Promise<number> {
    const before = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
    return this.database.transaction((transaction) =>
      this.repository.purgeTerminal(before, 100, transaction),
    );
  }

  private toSummary(
    item: Awaited<ReturnType<MailRepository['findDelivery']>> extends infer T
      ? NonNullable<T>
      : never,
  ) {
    return {
      id: item.id,
      jobId: item.jobId,
      templateKey: item.templateKey,
      templateVersion: item.templateVersion,
      templateRevision: item.templateRevision,
      recipientPreview: item.recipientPreview,
      status: item.status as 'queued' | 'sending' | 'sent' | 'exhausted',
      transport: item.transport as 'capture' | 'smtp' | null,
      attemptCount: item.attemptCount,
      simulated: item.simulated,
      sentAt: item.sentAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toTemplate(key: string, override: Awaited<ReturnType<MailRepository['findOverride']>>) {
    const definition = this.templates.require(key);
    return {
      key,
      name: definition.name,
      description: definition.description,
      version: definition.version,
      revision: override?.revision ?? null,
      variables: this.templates.variableNames(definition),
      subjectTemplate: override?.subjectTemplate ?? definition.subjectTemplate,
      textTemplate: override?.textTemplate ?? definition.textTemplate,
      overridden: Boolean(override),
      updatedAt: override?.updatedAt.toISOString() ?? null,
      updatedBy: override?.updatedBy ?? null,
    };
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function maskEmail(value: string): string {
  const [local = '', domain = ''] = value.trim().toLowerCase().split('@');
  return `${local.slice(0, 1)}***@${domain}`.slice(0, 320);
}
function safeMessage(value: string): string {
  return value
    .trim()
    .slice(0, 500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b(token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
}
