import type { DatabaseTransaction } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { StudentLessonAccountProvisioner } from '../../people/public.js';
import type { LessonAccountsRepository } from '../infrastructure/persistence/lesson-accounts.repository.js';

/**
 * Creates the empty account that belongs to an active student/institution service relation.
 * The people application service owns relation validation and calls this port in the same
 * transaction; all later balance changes still go through the lesson ledger commands.
 */
export class LessonAccountProvisioningService implements StudentLessonAccountProvisioner {
  constructor(
    private readonly repository: LessonAccountsRepository,
    private readonly audit: AuditWriter,
  ) {}

  async ensureForStudentInstitution(
    institutionId: string,
    studentId: string,
    context: AuditContext,
    transaction: DatabaseTransaction,
  ): Promise<void> {
    const { record, created } = await this.repository.lockOrCreateAccount(
      institutionId,
      studentId,
      transaction,
    );
    if (!created) return;

    await this.audit.record(
      {
        ...context,
        category: 'business',
        action: 'lesson-account.created',
        resourceType: 'lesson.account',
        resourceId: record.id,
        changes: [{ field: 'balanceUnits', before: null, after: 0 }],
        metadata: { institutionId, studentId },
      },
      transaction,
    );
  }
}
