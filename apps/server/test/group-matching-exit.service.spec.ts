import { describe, expect, it, vi } from 'vitest';

import type { DatabaseHandle } from '../src/database/database.js';
import { GroupMatchingService } from '../src/modules/group-matching/application/group-matching.service.js';
import type {
  GroupMatchingCampaignRecord,
  GroupMatchingDepositRefundRecord,
  GroupMatchingEnrollmentRecord,
  GroupMatchingRepository,
} from '../src/modules/group-matching/infrastructure/persistence/group-matching.repository.js';

const institutionId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const enrollmentId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-09-14T02:00:00.000Z');

function campaign(status: GroupMatchingCampaignRecord['status'] = 'ready') {
  return {
    id: campaignId,
    institutionId,
    title: '书法周期拼课',
    description: null,
    courseId: '55555555-5555-4555-8555-555555555555',
    courseNameSnapshot: '硬笔书法',
    campusId: '66666666-6666-4666-8666-666666666666',
    campusNameSnapshot: '成长空间',
    minParticipants: 2,
    maxParticipants: 4,
    depositAmountMinor: 1000,
    plannedSessionCount: 8,
    unitsPerSession: 1,
    durationMinutes: 60,
    candidateSchedule: null,
    recruitmentDeadlineAt: now,
    balanceDueAt: null,
    withdrawalPolicy: null,
    status,
    notes: null,
    createdByUserId: actorId,
    publishedAt: now,
    formedAt: null,
    cancelledAt: status === 'cancelled' ? now : null,
    cancellationReason: status === 'cancelled' ? '人数不足' : null,
    revision: 2,
    createdAt: now,
    updatedAt: now,
  } satisfies GroupMatchingCampaignRecord;
}

function enrollment(status: GroupMatchingEnrollmentRecord['status']) {
  const paid = ['deposit_paid', 'deposit_refunded', 'selected'].includes(status);
  return {
    id: enrollmentId,
    campaignId,
    institutionId,
    studentId: '77777777-7777-4777-8777-777777777777',
    studentNameSnapshot: '小满',
    guardianId: '88888888-8888-4888-8888-888888888888',
    guardianNameSnapshot: '小满妈妈',
    status,
    schedulePreference: null,
    notes: null,
    source: 'admin',
    depositAmountMinor: 1000,
    depositPaymentMethod: paid ? 'wechat_transfer' : null,
    depositPaymentReference: paid ? 'PAY-001' : null,
    depositPaymentNote: null,
    depositPaidAt: paid ? now : null,
    depositRecordedByUserId: paid ? actorId : null,
    withdrawnAt: status === 'withdrawn' ? now : null,
    withdrawalReason: status === 'withdrawn' ? '时间冲突' : null,
    withdrawnByUserId: status === 'withdrawn' ? actorId : null,
    withdrawalIdempotencyKey: status === 'withdrawn' ? 'withdrawal-key-001' : null,
    revision: 2,
    createdAt: now,
    updatedAt: now,
  } satisfies GroupMatchingEnrollmentRecord;
}

function refund(): GroupMatchingDepositRefundRecord {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    institutionId,
    campaignId,
    enrollmentId,
    amountMinor: 1000,
    currency: 'CNY',
    refundMethod: 'wechat_transfer',
    refundReference: 'REF-001',
    refundNote: '已退回',
    refundedAt: now,
    recordedByUserId: actorId,
    idempotencyKey: 'deposit-refund-key',
    enrollmentRevisionBefore: 2,
    createdAt: now,
  };
}

function service(repository: Record<string, unknown>) {
  const database = {
    db: {},
    transaction: async <T>(work: (transaction: unknown) => Promise<T>) => work({}),
  } as unknown as DatabaseHandle;
  return new GroupMatchingService(
    database,
    repository as unknown as GroupMatchingRepository,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { record: vi.fn().mockResolvedValue(undefined) },
    () => now,
  );
}

const actor = { actorId, actorType: 'user' as const };

describe('group matching refund and exit workflow', () => {
  it('records the full deposit refund before allowing withdrawal', async () => {
    const paid = enrollment('deposit_paid');
    const refunded = { ...paid, status: 'deposit_refunded' as const, revision: 3 };
    const withdrawn = {
      ...refunded,
      status: 'withdrawn' as const,
      withdrawnAt: now,
      withdrawalReason: '时间冲突',
      withdrawnByUserId: actorId,
      withdrawalIdempotencyKey: 'withdrawal-key-001',
      revision: 4,
    };
    const record = refund();
    const repository = {
      lockCampaign: vi.fn().mockResolvedValue(campaign()),
      lockEnrollment: vi.fn().mockResolvedValueOnce(paid).mockResolvedValueOnce(refunded),
      findDepositRefundByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findDepositRefundByEnrollment: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(record),
      createDepositRefund: vi.fn().mockResolvedValue(record),
      markDepositRefunded: vi.fn().mockResolvedValue(refunded),
      countPaidEnrollments: vi.fn().mockResolvedValue(1),
      transitionCampaign: vi.fn().mockResolvedValue(campaign('recruiting')),
      findEnrollmentByWithdrawalIdempotencyKey: vi.fn().mockResolvedValue(null),
      withdrawEnrollment: vi.fn().mockResolvedValue(withdrawn),
    };
    const subject = service(repository);

    const refundResult = await subject.recordDepositRefund(
      institutionId,
      campaignId,
      enrollmentId,
      {
        expectedRevision: 2,
        refundedAmountMinor: 1000,
        refundMethod: 'wechat_transfer',
        refundReference: 'REF-001',
        refundNote: '已退回',
      },
      'deposit-refund-key',
      actor,
    );
    expect(refundResult.status).toBe('deposit_refunded');
    expect(refundResult.depositRefund?.amountMinor).toBe(1000);

    const withdrawalResult = await subject.withdrawEnrollment(
      institutionId,
      campaignId,
      enrollmentId,
      { expectedRevision: 3, reason: '时间冲突' },
      'withdrawal-key-001',
      actor,
    );
    expect(withdrawalResult.status).toBe('withdrawn');
    expect(repository.createDepositRefund).toHaveBeenCalledOnce();
    expect(repository.withdrawEnrollment).toHaveBeenCalledOnce();
  });

  it('blocks campaign cancellation until every collected deposit has a refund fact', async () => {
    const paid = enrollment('deposit_paid');
    const repository = {
      lockCampaign: vi.fn().mockResolvedValue(campaign()),
      listEnrollments: vi.fn().mockResolvedValue([paid]),
      listDepositRefunds: vi.fn().mockResolvedValue([]),
    };
    await expect(
      service(repository).cancel(
        institutionId,
        campaignId,
        { expectedRevision: 2, reason: '人数不足' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_DEPOSIT_REFUND_REQUIRED' });
  });

  it('cancels after refund facts exist and auto-withdraws remaining unformed enrollments', async () => {
    const refunded = enrollment('deposit_refunded');
    const withdrawn = {
      ...refunded,
      status: 'withdrawn' as const,
      withdrawnAt: now,
      withdrawalReason: '拼课取消：人数不足',
      withdrawnByUserId: actorId,
      withdrawalIdempotencyKey: `campaign-cancel:${campaignId}:${enrollmentId}`,
    };
    const cancelled = {
      ...campaign('cancelled'),
      cancellationReason: '人数不足',
      revision: 3,
    };
    const repository = {
      lockCampaign: vi.fn().mockResolvedValue(campaign()),
      listEnrollments: vi.fn().mockResolvedValue([refunded]),
      listDepositRefunds: vi.fn().mockResolvedValue([refund()]),
      withdrawCancellableEnrollments: vi.fn().mockResolvedValue([withdrawn]),
      transitionCampaign: vi.fn().mockResolvedValue(cancelled),
      listTiers: vi.fn().mockResolvedValue([]),
    };

    const result = await service(repository).cancel(
      institutionId,
      campaignId,
      { expectedRevision: 2, reason: '人数不足' },
      actor,
    );
    expect(result.status).toBe('cancelled');
    expect(result.cancellationReason).toBe('人数不足');
    expect(repository.withdrawCancellableEnrollments).toHaveBeenCalledOnce();
  });
});
