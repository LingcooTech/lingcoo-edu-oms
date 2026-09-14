import { ApiError } from '@lingcoo-tech/http';
import type {
  AddGroupMatchingEnrollmentRequest,
  CancelGroupMatchingCampaignRequest,
  ConfirmGroupMatchingFormationRequest,
  CreateGroupMatchingCampaignRequest,
  GroupMatchingCampaign,
  GroupMatchingCampaignDetail,
  GroupMatchingCampaignListQuery,
  GroupMatchingEnrollment,
  GroupMatchingFormation,
  GroupMatchingPriceTier,
  LessonOrder,
  PublishGroupMatchingCampaignRequest,
  RecordGroupMatchingDepositRequest,
  UpdateGroupMatchingCampaignRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseExecutor, DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { GroupFormationOrderIssuer } from '../../lesson-commerce/public.js';
import type { LessonPackageIssuer } from '../../lesson-products/public.js';
import type { InstitutionDirectory } from '../../organization/public.js';
import type {
  GroupMatchingPeopleDirectory,
  GroupMatchingResourceDirectory,
} from '../domain/model.js';
import {
  GroupMatchingRepository,
  type GroupMatchingCampaignRecord,
  type GroupMatchingEnrollmentRecord,
  type GroupMatchingFormationMemberRecord,
  type GroupMatchingFormationRecord,
  type GroupMatchingPriceTierRecord,
} from '../infrastructure/persistence/group-matching.repository.js';

type ActorContext = AuditContext & { actorId: string };

export class GroupMatchingService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly repository: GroupMatchingRepository,
    private readonly institutions: InstitutionDirectory,
    private readonly people: GroupMatchingPeopleDirectory,
    private readonly resources: GroupMatchingResourceDirectory,
    private readonly packages: LessonPackageIssuer,
    private readonly orders: GroupFormationOrderIssuer,
    private readonly audit: AuditWriter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(institutionId: string, input: GroupMatchingCampaignListQuery) {
    const result = await this.repository.listCampaigns(institutionId, input);
    return {
      items: await Promise.all(result.items.map((campaign) => this.campaignView(campaign))),
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
    };
  }

  async get(institutionId: string, campaignId: string): Promise<GroupMatchingCampaignDetail> {
    const campaign = await this.requireCampaign(institutionId, campaignId);
    const [enrollments, formation] = await Promise.all([
      this.repository.listEnrollments(campaign.id),
      this.repository.findFormationByCampaign(campaign.id),
    ]);
    return {
      campaign: await this.campaignView(campaign, enrollments),
      enrollments: { items: enrollments.map((item) => this.enrollmentView(item)) },
      formation: formation ? await this.formationView(formation) : null,
    };
  }

  async create(
    institutionId: string,
    input: CreateGroupMatchingCampaignRequest,
    context: ActorContext,
  ): Promise<GroupMatchingCampaign> {
    const normalized = {
      ...input,
      depositAmountMinor: input.depositAmountMinor ?? 0,
      description: input.description ?? null,
      candidateSchedule: input.candidateSchedule ?? null,
      balanceDueAt: input.balanceDueAt ?? null,
      withdrawalPolicy: input.withdrawalPolicy ?? null,
      notes: input.notes ?? null,
    };
    this.validateCampaign(normalized);
    try {
      return await this.database.transaction(async (transaction) => {
        await this.institutions.assertActiveInstitution(institutionId, transaction);
        const [course, campus] = await Promise.all([
          this.resources.getCourse(institutionId, input.courseId, transaction),
          this.resources.getCampus(input.campusId),
        ]);
        if (course.status !== 'active') {
          throw new ApiError(409, 'GROUP_MATCHING_COURSE_INACTIVE', '只能选择已启用课程');
        }
        if (campus.status !== 'active') {
          throw new ApiError(409, 'GROUP_MATCHING_CAMPUS_INACTIVE', '只能选择已启用校区');
        }
        const created = await this.repository.createCampaign(
          {
            institutionId,
            title: normalized.title,
            description: normalized.description,
            courseId: course.id,
            courseNameSnapshot: course.name,
            campusId: campus.id,
            campusNameSnapshot: campus.name,
            minParticipants: normalized.minParticipants,
            maxParticipants: normalized.maxParticipants,
            depositAmountMinor: normalized.depositAmountMinor,
            plannedSessionCount: normalized.plannedSessionCount,
            unitsPerSession: normalized.unitsPerSession,
            durationMinutes: normalized.durationMinutes,
            candidateSchedule: normalized.candidateSchedule,
            recruitmentDeadlineAt: new Date(normalized.recruitmentDeadlineAt),
            balanceDueAt: normalized.balanceDueAt ? new Date(normalized.balanceDueAt) : null,
            withdrawalPolicy: normalized.withdrawalPolicy,
            notes: normalized.notes,
            createdByUserId: context.actorId,
          },
          normalized.priceTiers,
          transaction,
        );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'group-matching.campaign-created',
            resourceType: 'group-matching.campaign',
            resourceId: created.campaign.id,
            changes: [
              { field: 'status', before: null, after: created.campaign.status },
              { field: 'courseId', before: null, after: created.campaign.courseId },
              { field: 'campusId', before: null, after: created.campaign.campusId },
            ],
          },
          transaction,
        );
        return this.campaignView(created.campaign, [], created.tiers);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  async update(
    institutionId: string,
    campaignId: string,
    input: UpdateGroupMatchingCampaignRequest,
    context: ActorContext,
  ): Promise<GroupMatchingCampaign> {
    return this.database.transaction(async (transaction) => {
      const current = await this.repository.lockCampaign(campaignId, transaction);
      this.assertInstitution(current, institutionId);
      if (current!.status !== 'draft') {
        throw new ApiError(409, 'GROUP_MATCHING_CAMPAIGN_PUBLISHED', '只有草稿拼课可以编辑');
      }
      const existingTiers = await this.repository.listTiers(campaignId, transaction);
      const merged = {
        minParticipants: input.minParticipants ?? current!.minParticipants,
        maxParticipants: input.maxParticipants ?? current!.maxParticipants,
        depositAmountMinor: input.depositAmountMinor ?? current!.depositAmountMinor,
        plannedSessionCount: input.plannedSessionCount ?? current!.plannedSessionCount,
        unitsPerSession: input.unitsPerSession ?? current!.unitsPerSession,
        durationMinutes: input.durationMinutes ?? current!.durationMinutes,
        recruitmentDeadlineAt:
          input.recruitmentDeadlineAt ?? current!.recruitmentDeadlineAt.toISOString(),
        priceTiers: input.priceTiers ?? existingTiers,
      };
      this.validateCampaign(merged);
      const courseId = input.courseId ?? current!.courseId;
      const campusId = input.campusId ?? current!.campusId;
      const [course, campus] = await Promise.all([
        this.resources.getCourse(institutionId, courseId, transaction),
        this.resources.getCampus(campusId),
      ]);
      const updated = await this.repository.updateCampaign(
        campaignId,
        input.expectedRevision,
        {
          title: input.title,
          description: input.description,
          courseId,
          courseNameSnapshot: course.name,
          campusId,
          campusNameSnapshot: campus.name,
          minParticipants: input.minParticipants,
          maxParticipants: input.maxParticipants,
          depositAmountMinor: input.depositAmountMinor,
          plannedSessionCount: input.plannedSessionCount,
          unitsPerSession: input.unitsPerSession,
          durationMinutes: input.durationMinutes,
          candidateSchedule: input.candidateSchedule,
          recruitmentDeadlineAt: input.recruitmentDeadlineAt
            ? new Date(input.recruitmentDeadlineAt)
            : undefined,
          balanceDueAt:
            input.balanceDueAt === undefined
              ? undefined
              : input.balanceDueAt
                ? new Date(input.balanceDueAt)
                : null,
          withdrawalPolicy: input.withdrawalPolicy,
          notes: input.notes,
        },
        input.priceTiers,
        transaction,
      );
      if (!updated) {
        throw new ApiError(409, 'GROUP_MATCHING_VERSION_CONFLICT', '拼课已变化，请刷新后重试');
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'group-matching.campaign-updated',
          resourceType: 'group-matching.campaign',
          resourceId: campaignId,
          changes: [{ field: 'revision', before: current!.revision, after: updated.revision }],
        },
        transaction,
      );
      return this.campaignView(updated);
    });
  }

  async publish(
    institutionId: string,
    campaignId: string,
    input: PublishGroupMatchingCampaignRequest,
    context: ActorContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const current = await this.repository.lockCampaign(campaignId, transaction);
      this.assertInstitution(current, institutionId);
      if (current!.status !== 'draft') {
        if (current!.status === 'recruiting') return this.campaignView(current!);
        throw new ApiError(409, 'GROUP_MATCHING_CAMPAIGN_NOT_PUBLISHABLE', '当前拼课不能发布');
      }
      if (current!.revision !== input.expectedRevision) {
        throw new ApiError(409, 'GROUP_MATCHING_VERSION_CONFLICT', '拼课已变化，请刷新后重试');
      }
      if (current!.recruitmentDeadlineAt.getTime() <= this.clock().getTime()) {
        throw new ApiError(409, 'GROUP_MATCHING_DEADLINE_PASSED', '报名截止时间必须晚于当前时间');
      }
      const updated = await this.repository.transitionCampaign(
        campaignId,
        ['draft'],
        'recruiting',
        transaction,
        { publishedAt: this.clock() },
      );
      await this.recordTransition(
        current!,
        updated!,
        'group-matching.campaign-published',
        context,
        transaction,
      );
      return this.campaignView(updated!);
    });
  }

  async addEnrollment(
    institutionId: string,
    campaignId: string,
    input: AddGroupMatchingEnrollmentRequest,
    context: ActorContext,
  ): Promise<GroupMatchingEnrollment> {
    try {
      return await this.database.transaction(async (transaction) => {
        const campaign = await this.repository.lockCampaign(campaignId, transaction);
        this.assertInstitution(campaign, institutionId);
        if (!['recruiting', 'ready'].includes(campaign!.status)) {
          throw new ApiError(409, 'GROUP_MATCHING_NOT_RECRUITING', '该拼课当前不接受报名');
        }
        if (campaign!.recruitmentDeadlineAt.getTime() <= this.clock().getTime()) {
          throw new ApiError(409, 'GROUP_MATCHING_DEADLINE_PASSED', '该拼课报名已截止');
        }
        const snapshot = await this.people.getStudentGuardianSnapshot(
          institutionId,
          input.studentId,
          input.guardianId,
          transaction,
        );
        const paidCount = await this.repository.countPaidEnrollments(campaignId, transaction);
        const noDeposit =
          campaign!.depositAmountMinor === 0 && paidCount < campaign!.maxParticipants;
        const record = await this.repository.createEnrollment(
          {
            campaignId,
            institutionId,
            studentId: snapshot.student.id,
            studentNameSnapshot: snapshot.student.fullName,
            guardianId: snapshot.guardian.id,
            guardianNameSnapshot: snapshot.guardian.fullName,
            status:
              paidCount >= campaign!.maxParticipants
                ? 'waitlisted'
                : noDeposit
                  ? 'deposit_paid'
                  : 'pending_deposit',
            schedulePreference: input.schedulePreference,
            notes: input.notes,
            source: input.source,
            depositAmountMinor: campaign!.depositAmountMinor,
            depositPaymentMethod: noDeposit ? 'other' : null,
            depositPaymentNote: noDeposit ? '该拼课无需意向金，报名即占位' : null,
            depositPaidAt: noDeposit ? this.clock() : null,
            depositRecordedByUserId: noDeposit ? context.actorId : null,
          },
          transaction,
        );
        if (
          noDeposit &&
          paidCount + 1 >= campaign!.minParticipants &&
          campaign!.status === 'recruiting'
        ) {
          await this.repository.transitionCampaign(
            campaignId,
            ['recruiting'],
            'ready',
            transaction,
          );
        }
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'group-matching.enrollment-added',
            resourceType: 'group-matching.enrollment',
            resourceId: record.id,
            changes: [{ field: 'status', before: null, after: record.status }],
            metadata: { campaignId, studentId: record.studentId, guardianId: record.guardianId },
          },
          transaction,
        );
        return this.enrollmentView(record);
      });
    } catch (error) {
      this.translateConflict(error);
      throw error;
    }
  }

  async recordDeposit(
    institutionId: string,
    campaignId: string,
    enrollmentId: string,
    input: RecordGroupMatchingDepositRequest,
    context: ActorContext,
  ): Promise<GroupMatchingEnrollment> {
    return this.database.transaction(async (transaction) => {
      const campaign = await this.repository.lockCampaign(campaignId, transaction);
      this.assertInstitution(campaign, institutionId);
      if (!['recruiting', 'ready'].includes(campaign!.status)) {
        throw new ApiError(409, 'GROUP_MATCHING_DEPOSIT_NOT_ALLOWED', '当前不能登记意向金');
      }
      const enrollment = await this.repository.lockEnrollment(enrollmentId, transaction);
      if (!enrollment || enrollment.campaignId !== campaignId) {
        throw new ApiError(404, 'GROUP_MATCHING_ENROLLMENT_NOT_FOUND', '拼课报名不存在');
      }
      if (enrollment.status === 'deposit_paid' || enrollment.status === 'selected') {
        return this.enrollmentView(enrollment);
      }
      if (enrollment.revision !== input.expectedRevision) {
        throw new ApiError(409, 'GROUP_MATCHING_VERSION_CONFLICT', '报名已变化，请刷新后重试');
      }
      if (input.paidAmountMinor !== campaign!.depositAmountMinor) {
        throw new ApiError(
          400,
          'GROUP_MATCHING_DEPOSIT_AMOUNT_INVALID',
          '实收意向金必须等于计划意向金',
        );
      }
      const paidCount = await this.repository.countPaidEnrollments(campaignId, transaction);
      if (paidCount >= campaign!.maxParticipants) {
        throw new ApiError(409, 'GROUP_MATCHING_CAPACITY_FULL', '正式名额已满，该报名保持候补');
      }
      const updated = await this.repository.markDepositPaid(
        enrollmentId,
        {
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          paymentNote: input.paymentNote,
          recordedByUserId: context.actorId,
          paidAt: input.receivedAt ? new Date(input.receivedAt) : this.clock(),
        },
        transaction,
      );
      if (!updated) throw new ApiError(409, 'GROUP_MATCHING_DEPOSIT_CONFLICT', '意向金登记失败');
      if (paidCount + 1 >= campaign!.minParticipants && campaign!.status === 'recruiting') {
        await this.repository.transitionCampaign(campaignId, ['recruiting'], 'ready', transaction);
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'group-matching.deposit-recorded',
          resourceType: 'group-matching.enrollment',
          resourceId: updated.id,
          changes: [
            { field: 'status', before: enrollment.status, after: updated.status },
            { field: 'depositAmountMinor', before: null, after: updated.depositAmountMinor },
          ],
          metadata: { campaignId, paymentMethod: updated.depositPaymentMethod },
        },
        transaction,
      );
      return this.enrollmentView(updated);
    });
  }

  async confirmFormation(
    institutionId: string,
    campaignId: string,
    input: ConfirmGroupMatchingFormationRequest,
    context: ActorContext,
  ): Promise<GroupMatchingFormation> {
    await this.database.transaction(async (transaction) => {
      const existing = await this.repository.findFormationByCampaign(campaignId, transaction);
      if (existing) {
        if (existing.institutionId !== institutionId) {
          throw new ApiError(404, 'GROUP_MATCHING_CAMPAIGN_NOT_FOUND', '拼课计划不存在');
        }
        return existing;
      }
      const campaign = await this.repository.lockCampaign(campaignId, transaction);
      this.assertInstitution(campaign, institutionId);
      if (campaign!.status !== 'ready') {
        throw new ApiError(409, 'GROUP_MATCHING_NOT_READY', '只有达到成班人数的拼课可以确认成班');
      }
      if (campaign!.revision !== input.expectedRevision) {
        throw new ApiError(409, 'GROUP_MATCHING_VERSION_CONFLICT', '拼课已变化，请刷新后重试');
      }
      const enrollmentIds = [...new Set(input.selectedEnrollmentIds)];
      if (
        enrollmentIds.length < campaign!.minParticipants ||
        enrollmentIds.length > campaign!.maxParticipants
      ) {
        throw new ApiError(
          400,
          'GROUP_MATCHING_FORMATION_HEADCOUNT_INVALID',
          '入选人数不符合成班范围',
        );
      }
      const enrollments = await this.repository.listEnrollments(campaignId, transaction);
      const selected = enrollmentIds.map((id) => enrollments.find((item) => item.id === id));
      if (selected.some((item) => !item || item.status !== 'deposit_paid')) {
        throw new ApiError(
          409,
          'GROUP_MATCHING_FORMATION_MEMBER_INVALID',
          '入选学员必须已支付意向金',
        );
      }
      const tiers = await this.repository.listTiers(campaignId, transaction);
      const tier = tiers.find(
        (item) =>
          enrollmentIds.length >= item.minParticipants &&
          enrollmentIds.length <= item.maxParticipants,
      );
      if (!tier) throw new ApiError(409, 'GROUP_MATCHING_PRICE_TIER_MISSING', '没有匹配的成班价格');
      if (campaign!.depositAmountMinor > tier.unitPriceMinor) {
        throw new ApiError(409, 'GROUP_MATCHING_DEPOSIT_EXCEEDS_PRICE', '意向金不能高于最终成交价');
      }
      const [classroom, teacher] = await Promise.all([
        input.classroomId
          ? this.resources.getClassroom(campaign!.campusId, input.classroomId, transaction)
          : null,
        input.teacherId
          ? this.people.getActiveTeacherSnapshot(input.teacherId, institutionId, transaction)
          : null,
      ]);
      const balanceAmountMinor = tier.unitPriceMinor - campaign!.depositAmountMinor;
      const totalUnits = campaign!.plannedSessionCount * campaign!.unitsPerSession;
      const created = await this.repository.createFormation(
        {
          campaignId,
          institutionId,
          campaignRevision: campaign!.revision,
          titleSnapshot: campaign!.title,
          courseId: campaign!.courseId,
          courseNameSnapshot: campaign!.courseNameSnapshot,
          campusId: campaign!.campusId,
          campusNameSnapshot: campaign!.campusNameSnapshot,
          classroomId: classroom?.id ?? null,
          classroomNameSnapshot: classroom?.name ?? null,
          teacherId: teacher?.id ?? null,
          teacherNameSnapshot: teacher?.fullName ?? null,
          scheduleDescription: input.scheduleDescription,
          finalParticipantCount: enrollmentIds.length,
          unitPriceMinor: tier.unitPriceMinor,
          depositAmountMinor: campaign!.depositAmountMinor,
          balanceAmountMinor,
          plannedSessionCount: campaign!.plannedSessionCount,
          unitsPerSession: campaign!.unitsPerSession,
          totalUnits,
          durationMinutes: campaign!.durationMinutes,
          balanceDueAt: input.balanceDueAt ? new Date(input.balanceDueAt) : campaign!.balanceDueAt,
          confirmedByUserId: context.actorId,
          confirmedAt: this.clock(),
        },
        selected.map((item) => ({
          enrollmentId: item!.id,
          studentId: item!.studentId,
          studentNameSnapshot: item!.studentNameSnapshot,
          guardianId: item!.guardianId,
          guardianNameSnapshot: item!.guardianNameSnapshot,
          totalAmountMinor: tier.unitPriceMinor,
          depositAppliedMinor: campaign!.depositAmountMinor,
          balanceDueMinor: balanceAmountMinor,
        })),
        enrollmentIds,
        transaction,
      );
      await this.repository.transitionCampaign(campaignId, ['ready'], 'formed', transaction, {
        formedAt: this.clock(),
      });
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'group-matching.formation-confirmed',
          resourceType: 'group-matching.formation',
          resourceId: created.formation.id,
          changes: [
            { field: 'finalParticipantCount', before: null, after: enrollmentIds.length },
            { field: 'unitPriceMinor', before: null, after: tier.unitPriceMinor },
            { field: 'totalUnits', before: null, after: totalUnits },
          ],
          metadata: { campaignId, selectedEnrollmentIds: enrollmentIds },
        },
        transaction,
      );
      return created.formation;
    });
    return this.ensureFormationSettlement(institutionId, campaignId, context);
  }

  async ensureFormationSettlement(
    institutionId: string,
    campaignId: string,
    context: ActorContext,
  ): Promise<GroupMatchingFormation> {
    const formation = await this.repository.findFormationByCampaign(campaignId);
    if (!formation || formation.institutionId !== institutionId) {
      throw new ApiError(404, 'GROUP_MATCHING_FORMATION_NOT_FOUND', '拼课成班结论不存在');
    }
    const [members, enrollments] = await Promise.all([
      this.repository.listFormationMembers(formation.id),
      this.repository.listEnrollments(campaignId),
    ]);
    const lessonPackage = await this.packages.ensureInternalPackageForFormation(
      {
        institutionId,
        formationId: formation.id,
        name: `${formation.titleSnapshot} · ${formation.finalParticipantCount} 人成班`,
        description: `${formation.courseNameSnapshot}｜${formation.campusNameSnapshot}｜${formation.scheduleDescription}`,
        baseUnits: formation.totalUnits,
        bonusUnits: 0,
        priceAmount: formation.unitPriceMinor,
      },
      context,
    );
    await this.database.transaction(async (transaction) => {
      const attached = await this.repository.attachFormationPackage(
        formation.id,
        lessonPackage.packageId,
        lessonPackage.version,
        transaction,
      );
      if (!attached) {
        throw new ApiError(409, 'GROUP_FORMATION_PACKAGE_CONFLICT', '成班课时包绑定发生冲突');
      }
    });

    const lessonOrders = await this.orders.ensureGroupFormationOrders(
      {
        institutionId,
        formationId: formation.id,
        packageId: lessonPackage.packageId,
        packageVersion: lessonPackage.version,
        paymentDeadlineAt: formation.balanceDueAt,
        members: members.map((member) => {
          const enrollment = enrollments.find((item) => item.id === member.enrollmentId);
          if (!enrollment?.depositPaymentMethod) {
            throw new ApiError(
              409,
              'GROUP_FORMATION_DEPOSIT_SNAPSHOT_MISSING',
              '入选学员缺少意向金支付方式',
            );
          }
          return {
            studentId: member.studentId,
            studentName: member.studentNameSnapshot,
            guardianId: member.guardianId,
            guardianName: member.guardianNameSnapshot,
            totalAmountMinor: member.totalAmountMinor,
            depositAppliedMinor: member.depositAppliedMinor,
            balanceDueMinor: member.balanceDueMinor,
            depositPaymentMethod: enrollment.depositPaymentMethod,
          };
        }),
      },
      context,
    );
    await this.database.transaction(async (transaction) => {
      for (const member of members) {
        const order = lessonOrders.find((item) => item.studentId === member.studentId);
        if (!order) {
          throw new ApiError(409, 'GROUP_FORMATION_ORDER_MISSING', '成班学员订单创建不完整');
        }
        const attached = await this.repository.attachFormationMemberOrder(
          formation.id,
          member.studentId,
          order.id,
          this.memberStatus(order),
          transaction,
        );
        if (!attached) {
          throw new ApiError(409, 'GROUP_FORMATION_ORDER_CONFLICT', '成班学员订单绑定发生冲突');
        }
      }
    });
    const refreshed = await this.repository.findFormationByCampaign(campaignId);
    return this.formationView(refreshed!, this.database.db, undefined, lessonOrders);
  }

  async cancel(
    institutionId: string,
    campaignId: string,
    input: CancelGroupMatchingCampaignRequest,
    context: ActorContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const campaign = await this.repository.lockCampaign(campaignId, transaction);
      this.assertInstitution(campaign, institutionId);
      if (campaign!.status === 'cancelled') return this.campaignView(campaign!);
      if (campaign!.status === 'formed') {
        throw new ApiError(409, 'GROUP_MATCHING_FORMED_IMMUTABLE', '已确认成班不能直接取消');
      }
      if (campaign!.revision !== input.expectedRevision) {
        throw new ApiError(409, 'GROUP_MATCHING_VERSION_CONFLICT', '拼课已变化，请刷新后重试');
      }
      if ((await this.repository.countPaidEnrollments(campaignId, transaction)) > 0) {
        throw new ApiError(
          409,
          'GROUP_MATCHING_DEPOSIT_REFUND_REQUIRED',
          '存在已收意向金，请先完成退款流程',
        );
      }
      const updated = await this.repository.transitionCampaign(
        campaignId,
        ['draft', 'recruiting', 'ready'],
        'cancelled',
        transaction,
        { cancelledAt: this.clock(), notes: input.reason },
      );
      if (!updated) throw new ApiError(409, 'GROUP_MATCHING_CANCEL_CONFLICT', '取消拼课失败');
      await this.recordTransition(
        campaign!,
        updated,
        'group-matching.campaign-cancelled',
        context,
        transaction,
        { reason: input.reason },
      );
      return this.campaignView(updated);
    });
  }

  private async campaignView(
    record: GroupMatchingCampaignRecord,
    enrollments?: GroupMatchingEnrollmentRecord[],
    tiers?: GroupMatchingPriceTierRecord[],
  ): Promise<GroupMatchingCampaign> {
    const [allEnrollments, allTiers] = await Promise.all([
      enrollments ?? this.repository.listEnrollments(record.id),
      tiers ?? this.repository.listTiers(record.id),
    ]);
    return {
      ...record,
      priceTiers: allTiers.map((tier) => this.tierView(tier)),
      enrollmentCount: allEnrollments.filter((item) => item.status !== 'withdrawn').length,
      depositPaidCount: allEnrollments.filter((item) =>
        ['deposit_paid', 'selected'].includes(item.status),
      ).length,
      selectedCount: allEnrollments.filter((item) => item.status === 'selected').length,
      waitlistedCount: allEnrollments.filter((item) => item.status === 'waitlisted').length,
      recruitmentDeadlineAt: record.recruitmentDeadlineAt.toISOString(),
      balanceDueAt: record.balanceDueAt?.toISOString() ?? null,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      formedAt: record.formedAt?.toISOString() ?? null,
      cancelledAt: record.cancelledAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private enrollmentView(record: GroupMatchingEnrollmentRecord): GroupMatchingEnrollment {
    return {
      ...record,
      depositPaidAt: record.depositPaidAt?.toISOString() ?? null,
      withdrawnAt: record.withdrawnAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private async formationView(
    record: GroupMatchingFormationRecord,
    executor: DatabaseExecutor = this.database.db,
    suppliedMembers?: GroupMatchingFormationMemberRecord[],
    suppliedOrders?: LessonOrder[],
  ): Promise<GroupMatchingFormation> {
    const members =
      suppliedMembers ?? (await this.repository.listFormationMembers(record.id, executor));
    const orders = suppliedOrders ?? (await this.orders.listGroupFormationOrders(record.id));
    return {
      ...record,
      selectedLearners: members.map((member) => ({
        ...member,
        status: this.memberStatus(orders.find((order) => order.id === member.lessonOrderId)),
        lessonOrderNo: orders.find((order) => order.id === member.lessonOrderId)?.orderNo ?? null,
        lessonOrderRevision:
          orders.find((order) => order.id === member.lessonOrderId)?.revision ?? null,
        lessonOrderStatus:
          orders.find((order) => order.id === member.lessonOrderId)?.status ?? null,
        createdAt: member.createdAt.toISOString(),
        updatedAt: member.updatedAt.toISOString(),
      })),
      balanceDueAt: record.balanceDueAt?.toISOString() ?? null,
      confirmedAt: record.confirmedAt.toISOString(),
      createdAt: record.createdAt.toISOString(),
    };
  }

  private memberStatus(order: LessonOrder | undefined) {
    if (!order) return 'awaiting_order' as const;
    if (order.status === 'completed') return 'completed' as const;
    if (['closed', 'refunded'].includes(order.status)) return 'closed' as const;
    return 'awaiting_balance' as const;
  }

  private tierView(record: GroupMatchingPriceTierRecord): GroupMatchingPriceTier {
    return {
      id: record.id,
      campaignId: record.campaignId,
      minParticipants: record.minParticipants,
      maxParticipants: record.maxParticipants,
      unitPriceMinor: record.unitPriceMinor,
      currency: record.currency,
      description: record.description,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private validateCampaign(input: {
    minParticipants: number;
    maxParticipants: number;
    depositAmountMinor: number;
    plannedSessionCount: number;
    unitsPerSession: number;
    durationMinutes: number;
    recruitmentDeadlineAt: string | Date;
    priceTiers: Array<{ minParticipants: number; maxParticipants: number; unitPriceMinor: number }>;
  }) {
    if (input.minParticipants < 2 || input.maxParticipants < input.minParticipants) {
      throw new ApiError(
        400,
        'GROUP_MATCHING_HEADCOUNT_INVALID',
        '周期拼课至少 2 人，最大人数不得小于最低人数',
      );
    }
    if (input.plannedSessionCount < 2 || input.unitsPerSession < 1 || input.durationMinutes < 1) {
      throw new ApiError(
        400,
        'GROUP_MATCHING_PERIOD_INVALID',
        '周期拼课至少包含 2 次课，课时和时长必须大于 0',
      );
    }
    const tiers = [...input.priceTiers].sort((a, b) => a.minParticipants - b.minParticipants);
    let expected = input.minParticipants;
    for (const tier of tiers) {
      if (
        tier.minParticipants !== expected ||
        tier.maxParticipants < tier.minParticipants ||
        tier.unitPriceMinor <= 0
      ) {
        throw new ApiError(
          400,
          'GROUP_MATCHING_PRICE_TIERS_INVALID',
          '阶梯价格必须连续覆盖成班人数范围且价格大于 0',
        );
      }
      expected = tier.maxParticipants + 1;
    }
    if (expected !== input.maxParticipants + 1) {
      throw new ApiError(
        400,
        'GROUP_MATCHING_PRICE_TIERS_INVALID',
        '阶梯价格必须完整覆盖最低至最大成班人数',
      );
    }
    if (input.depositAmountMinor > Math.min(...tiers.map((tier) => tier.unitPriceMinor))) {
      throw new ApiError(
        400,
        'GROUP_MATCHING_DEPOSIT_EXCEEDS_PRICE',
        '意向金不能高于任何人数档的成交价',
      );
    }
    if (Number.isNaN(new Date(input.recruitmentDeadlineAt).getTime())) {
      throw new ApiError(400, 'GROUP_MATCHING_DEADLINE_INVALID', '报名截止时间无效');
    }
  }

  private async requireCampaign(institutionId: string, campaignId: string) {
    const record = await this.repository.findCampaign(campaignId);
    this.assertInstitution(record, institutionId);
    return record!;
  }

  private assertInstitution(record: GroupMatchingCampaignRecord | null, institutionId: string) {
    if (!record || record.institutionId !== institutionId) {
      throw new ApiError(404, 'GROUP_MATCHING_CAMPAIGN_NOT_FOUND', '拼课计划不存在');
    }
  }

  private async recordTransition(
    before: GroupMatchingCampaignRecord,
    after: GroupMatchingCampaignRecord,
    action: string,
    context: ActorContext,
    transaction: Parameters<AuditWriter['record']>[1],
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.record(
      {
        ...context,
        category: 'business',
        action,
        resourceType: 'group-matching.campaign',
        resourceId: before.id,
        changes: [{ field: 'status', before: before.status, after: after.status }],
        metadata,
      },
      transaction,
    );
  }

  private translateConflict(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ApiError(409, 'GROUP_MATCHING_DUPLICATE', '拼课名称或学员报名已存在');
    }
  }
}
