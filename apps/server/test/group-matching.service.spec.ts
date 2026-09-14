import { describe, expect, it, vi } from 'vitest';

import {
  createGroupMatchingCampaignRequestSchema,
  type ConfirmGroupMatchingFormationRequest,
} from '@lingcoo-edu-oms/contracts';

import { GroupMatchingService } from '../src/modules/group-matching/application/group-matching.service.js';
import type {
  GroupMatchingCampaignRecord,
  GroupMatchingEnrollmentRecord,
  GroupMatchingFormationMemberRecord,
  GroupMatchingFormationRecord,
  GroupMatchingPriceTierRecord,
} from '../src/modules/group-matching/infrastructure/persistence/group-matching.repository.js';

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '22222222-2222-4222-8222-222222222222';
const CAMPUS_ID = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const PACKAGE_ID = '12121212-1212-4212-8212-121212121212';
const NOW = new Date('2026-09-13T08:00:00.000Z');

const ENROLLMENT_IDS = [
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888',
];

function campaign(
  overrides: Partial<GroupMatchingCampaignRecord> = {},
): GroupMatchingCampaignRecord {
  return {
    id: CAMPAIGN_ID,
    institutionId: INSTITUTION_ID,
    title: '秋季硬笔书法周期拼课',
    description: null,
    courseId: COURSE_ID,
    courseNameSnapshot: '硬笔书法',
    campusId: CAMPUS_ID,
    campusNameSnapshot: '成长空间校区',
    minParticipants: 2,
    maxParticipants: 4,
    depositAmountMinor: 100,
    plannedSessionCount: 8,
    unitsPerSession: 2,
    durationMinutes: 90,
    candidateSchedule: '周六上午或周日下午',
    recruitmentDeadlineAt: new Date('2026-10-01T00:00:00.000Z'),
    balanceDueAt: new Date('2026-10-05T00:00:00.000Z'),
    withdrawalPolicy: null,
    status: 'ready',
    notes: null,
    createdByUserId: ACTOR_ID,
    publishedAt: new Date('2026-09-10T00:00:00.000Z'),
    formedAt: null,
    cancelledAt: null,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function tier(
  minParticipants: number,
  maxParticipants: number,
  unitPriceMinor: number,
): GroupMatchingPriceTierRecord {
  return {
    id: `${minParticipants}${maxParticipants}000000-0000-4000-8000-000000000000`,
    campaignId: CAMPAIGN_ID,
    minParticipants,
    maxParticipants,
    unitPriceMinor,
    currency: 'CNY',
    description: null,
    createdAt: NOW,
  };
}

function enrollment(
  id: string,
  status: GroupMatchingEnrollmentRecord['status'],
): GroupMatchingEnrollmentRecord {
  const paid = status === 'deposit_paid' || status === 'selected';
  return {
    id,
    campaignId: CAMPAIGN_ID,
    institutionId: INSTITUTION_ID,
    studentId: id,
    studentNameSnapshot: `学员 ${id.slice(0, 4)}`,
    guardianId: id,
    guardianNameSnapshot: `家长 ${id.slice(0, 4)}`,
    status,
    schedulePreference: '周六上午',
    notes: null,
    source: 'admin',
    depositAmountMinor: 100,
    depositPaymentMethod: paid ? 'cash' : null,
    depositPaymentReference: paid ? 'CASH-001' : null,
    depositPaymentNote: paid ? '线下收取' : null,
    depositPaidAt: paid ? NOW : null,
    depositRecordedByUserId: paid ? ACTOR_ID : null,
    withdrawnAt: null,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class InMemoryGroupMatchingRepository {
  campaignRecord: GroupMatchingCampaignRecord;
  tierRecords: GroupMatchingPriceTierRecord[];
  enrollmentRecords: GroupMatchingEnrollmentRecord[];
  formationRecord: GroupMatchingFormationRecord | null = null;
  memberRecords: GroupMatchingFormationMemberRecord[] = [];
  createFormationCalls = 0;
  transitionCalls = 0;

  constructor(
    options: {
      campaign?: Partial<GroupMatchingCampaignRecord>;
      tiers?: GroupMatchingPriceTierRecord[];
      enrollments?: GroupMatchingEnrollmentRecord[];
    } = {},
  ) {
    this.campaignRecord = campaign(options.campaign);
    this.tierRecords = options.tiers ?? [tier(2, 4, 900)];
    this.enrollmentRecords = options.enrollments ?? [];
  }

  async findFormationByCampaign() {
    return this.formationRecord;
  }

  async lockCampaign() {
    return this.campaignRecord;
  }

  async listEnrollments() {
    return this.enrollmentRecords;
  }

  async listTiers() {
    return this.tierRecords;
  }

  async createFormation(input: Record<string, unknown>, members: Array<Record<string, unknown>>) {
    this.createFormationCalls += 1;
    this.formationRecord = {
      ...input,
      id: '99999999-9999-4999-8999-999999999999',
      createdAt: NOW,
    } as unknown as GroupMatchingFormationRecord;
    this.memberRecords = members.map((member, index) => ({
      ...member,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
      formationId: this.formationRecord!.id,
      status: 'awaiting_order',
      createdAt: NOW,
      updatedAt: NOW,
    })) as unknown as GroupMatchingFormationMemberRecord[];
    return { formation: this.formationRecord, members: this.memberRecords };
  }

  async transitionCampaign(
    _id: string,
    _fromStatuses: GroupMatchingCampaignRecord['status'][],
    toStatus: GroupMatchingCampaignRecord['status'],
    _executor: unknown,
    extra: Partial<GroupMatchingCampaignRecord> = {},
  ) {
    this.transitionCalls += 1;
    this.campaignRecord = {
      ...this.campaignRecord,
      ...extra,
      status: toStatus,
      revision: this.campaignRecord.revision + 1,
      updatedAt: NOW,
    };
    return this.campaignRecord;
  }

  async listFormationMembers() {
    return this.memberRecords;
  }

  async attachFormationPackage(
    _formationId: string,
    lessonPackageId: string,
    lessonPackageVersion: number,
  ) {
    this.formationRecord = {
      ...this.formationRecord!,
      lessonPackageId,
      lessonPackageVersion,
    };
    return this.formationRecord;
  }

  async attachFormationMemberOrder(
    _formationId: string,
    studentId: string,
    lessonOrderId: string,
    status: GroupMatchingFormationMemberRecord['status'],
  ) {
    const member = this.memberRecords.find((item) => item.studentId === studentId);
    if (!member) return null;
    member.lessonOrderId = lessonOrderId;
    member.status = status;
    return member;
  }
}

function service(repository: InMemoryGroupMatchingRepository) {
  const database = {
    db: {},
    transaction: async (work: (transaction: unknown) => Promise<unknown>) => work({}),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const packages = {
    ensureInternalPackageForFormation: vi.fn(async (input: { formationId: string }) => ({
      id: '13131313-1313-4313-8313-131313131313',
      packageId: PACKAGE_ID,
      institutionId: INSTITUTION_ID,
      version: 1,
      name: '成班课时包',
      description: null,
      saleScope: 'internal',
      originType: 'group_formation',
      originId: input.formationId,
      baseUnits: 16,
      bonusUnits: 0,
      priceAmount: 900,
      currency: 'CNY',
      onlineSaleEnabled: false,
      saleStartsAt: null,
      saleEndsAt: null,
      status: 'active',
      createdAt: NOW,
    })),
  };
  let lessonOrders: Array<Record<string, unknown>> = [];
  const orders = {
    ensureGroupFormationOrders: vi.fn(async (input: { members: Array<{ studentId: string }> }) => {
      lessonOrders = input.members.map((member, index) => ({
        id: `14141414-1414-4414-8414-14141414141${index}`,
        studentId: member.studentId,
        orderNo: `GROUP-${index + 1}`,
        status: 'awaiting_settlement',
      }));
      return lessonOrders;
    }),
    listGroupFormationOrders: vi.fn(async () => lessonOrders),
  };

  return new GroupMatchingService(
    database as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    packages as never,
    orders as never,
    audit as never,
    () => NOW,
  );
}

const baseCampaignRequest = {
  title: '秋季硬笔书法周期拼课',
  description: null,
  courseId: COURSE_ID,
  campusId: CAMPUS_ID,
  minParticipants: 2,
  maxParticipants: 6,
  depositAmountMinor: 800,
  plannedSessionCount: 8,
  unitsPerSession: 2,
  durationMinutes: 90,
  candidateSchedule: '周六上午',
  recruitmentDeadlineAt: '2026-10-01T00:00:00.000Z',
  balanceDueAt: null,
  withdrawalPolicy: null,
  notes: null,
  priceTiers: [
    { minParticipants: 2, maxParticipants: 3, unitPriceMinor: 1000, description: null },
    { minParticipants: 4, maxParticipants: 6, unitPriceMinor: 800, description: null },
  ],
};

const actorContext = {
  actorId: ACTOR_ID,
  actorType: 'user' as const,
  actorLabel: null,
};

function formationInput(selectedEnrollmentIds: string[]): ConfirmGroupMatchingFormationRequest {
  return {
    expectedRevision: 1,
    classroomId: null,
    teacherId: null,
    scheduleDescription: '每周六 09:00—10:30，连续 8 周',
    selectedEnrollmentIds,
    balanceDueAt: '2026-10-05T00:00:00.000Z',
  };
}

describe('GroupMatchingService rules', () => {
  it('requires price tiers to continuously cover the full participant range', async () => {
    const valid = createGroupMatchingCampaignRequestSchema.safeParse(baseCampaignRequest);
    expect(valid.success).toBe(true);

    const gap = {
      ...baseCampaignRequest,
      priceTiers: [
        { minParticipants: 2, maxParticipants: 3, unitPriceMinor: 1000, description: null },
        { minParticipants: 5, maxParticipants: 6, unitPriceMinor: 800, description: null },
      ],
    };
    expect(createGroupMatchingCampaignRequestSchema.safeParse(gap).success).toBe(false);
    await expect(
      service(new InMemoryGroupMatchingRepository()).create(INSTITUTION_ID, gap, actorContext),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_PRICE_TIERS_INVALID' });

    const overlap = {
      ...baseCampaignRequest,
      priceTiers: [
        { minParticipants: 2, maxParticipants: 4, unitPriceMinor: 1000, description: null },
        { minParticipants: 4, maxParticipants: 6, unitPriceMinor: 800, description: null },
      ],
    };
    expect(createGroupMatchingCampaignRequestSchema.safeParse(overlap).success).toBe(false);
    await expect(
      service(new InMemoryGroupMatchingRepository()).create(INSTITUTION_ID, overlap, actorContext),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_PRICE_TIERS_INVALID' });
  });

  it('requires at least two planned sessions and keeps deposit no higher than the lowest tier price', async () => {
    const tooShort = { ...baseCampaignRequest, plannedSessionCount: 1 };
    expect(createGroupMatchingCampaignRequestSchema.safeParse(tooShort).success).toBe(false);
    await expect(
      service(new InMemoryGroupMatchingRepository()).create(INSTITUTION_ID, tooShort, actorContext),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_PERIOD_INVALID' });

    const depositTooHigh = { ...baseCampaignRequest, depositAmountMinor: 801 };
    await expect(
      service(new InMemoryGroupMatchingRepository()).create(
        INSTITUTION_ID,
        depositTooHigh,
        actorContext,
      ),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_DEPOSIT_EXCEEDS_PRICE' });
  });

  it('does not form a campaign before it is ready or when selected headcount is below minimum', async () => {
    const repository = new InMemoryGroupMatchingRepository({
      campaign: { status: 'recruiting' },
      enrollments: [enrollment(ENROLLMENT_IDS[0]!, 'deposit_paid')],
    });
    await expect(
      service(repository).confirmFormation(
        INSTITUTION_ID,
        CAMPAIGN_ID,
        formationInput([ENROLLMENT_IDS[0]!]),
        actorContext,
      ),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_NOT_READY' });

    const readyRepository = new InMemoryGroupMatchingRepository({
      enrollments: [enrollment(ENROLLMENT_IDS[0]!, 'deposit_paid')],
    });
    await expect(
      service(readyRepository).confirmFormation(
        INSTITUTION_ID,
        CAMPAIGN_ID,
        formationInput([ENROLLMENT_IDS[0]!]),
        actorContext,
      ),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_FORMATION_HEADCOUNT_INVALID' });
  });

  it('allows only paid-deposit enrollments to enter the formation', async () => {
    const repository = new InMemoryGroupMatchingRepository({
      enrollments: [
        enrollment(ENROLLMENT_IDS[0]!, 'deposit_paid'),
        enrollment(ENROLLMENT_IDS[1]!, 'pending_deposit'),
      ],
    });

    await expect(
      service(repository).confirmFormation(
        INSTITUTION_ID,
        CAMPAIGN_ID,
        formationInput([ENROLLMENT_IDS[0]!, ENROLLMENT_IDS[1]!]),
        actorContext,
      ),
    ).rejects.toMatchObject({ code: 'GROUP_MATCHING_FORMATION_MEMBER_INVALID' });
    expect(repository.createFormationCalls).toBe(0);
  });

  it('snapshots the final amount as deposit plus balance for every selected learner', async () => {
    const repository = new InMemoryGroupMatchingRepository({
      campaign: { depositAmountMinor: 100, plannedSessionCount: 8, unitsPerSession: 2 },
      tiers: [tier(2, 4, 900)],
      enrollments: [
        enrollment(ENROLLMENT_IDS[0]!, 'deposit_paid'),
        enrollment(ENROLLMENT_IDS[1]!, 'deposit_paid'),
      ],
    });

    const formation = await service(repository).confirmFormation(
      INSTITUTION_ID,
      CAMPAIGN_ID,
      formationInput([ENROLLMENT_IDS[0]!, ENROLLMENT_IDS[1]!]),
      actorContext,
    );

    expect(formation.finalParticipantCount).toBe(2);
    expect(formation.unitPriceMinor).toBe(900);
    expect(formation.depositAmountMinor + formation.balanceAmountMinor).toBe(
      formation.unitPriceMinor,
    );
    expect(formation.totalUnits).toBe(16);
    expect(formation.selectedLearners).toHaveLength(2);
    for (const member of formation.selectedLearners) {
      expect(member.totalAmountMinor).toBe(member.depositAppliedMinor + member.balanceDueMinor);
      expect(member.depositAppliedMinor).toBe(100);
      expect(member.balanceDueMinor).toBe(800);
    }
  });

  it('returns the same immutable formation snapshot for a repeated confirmation', async () => {
    const repository = new InMemoryGroupMatchingRepository({
      enrollments: [
        enrollment(ENROLLMENT_IDS[0]!, 'deposit_paid'),
        enrollment(ENROLLMENT_IDS[1]!, 'deposit_paid'),
      ],
    });
    const first = await service(repository).confirmFormation(
      INSTITUTION_ID,
      CAMPAIGN_ID,
      formationInput([ENROLLMENT_IDS[0]!, ENROLLMENT_IDS[1]!]),
      actorContext,
    );
    const second = await service(repository).confirmFormation(
      INSTITUTION_ID,
      CAMPAIGN_ID,
      formationInput([ENROLLMENT_IDS[1]!, ENROLLMENT_IDS[0]!]),
      actorContext,
    );

    expect(second).toEqual(first);
    expect(repository.createFormationCalls).toBe(1);
    expect(repository.transitionCalls).toBe(1);
  });
});
