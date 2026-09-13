import { ApiError } from '@lingcoo-tech/http';
import type {
  EducationDataScope,
  LessonAccount,
  LessonBatch,
  LessonOrder,
  PeriodCardEntitlement,
  Student360Delivery,
  Student360Response,
} from '@lingcoo-edu-oms/contracts';

import type { Student360Dependencies } from '../domain/ports.js';

export class Student360Service {
  constructor(
    private readonly dependencies: Student360Dependencies,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(
    institutionId: string,
    studentId: string,
    scope: EducationDataScope,
  ): Promise<Student360Response> {
    const [institution, student, guardianResult] = await Promise.all([
      this.dependencies.organization.getInstitution(institutionId),
      this.dependencies.people.getStudent(studentId, scope),
      this.dependencies.people.listGuardianBindings(studentId, scope),
    ]);
    if (student.institutionId !== institutionId) {
      throw new ApiError(404, 'STUDENT_NOT_FOUND', '学员不属于当前机构');
    }

    const [account, batches, movements, entitlements, usages, orders, deliveries, classes] =
      await Promise.all([
        this.dependencies.lessonAccounts.get(institutionId, studentId, scope),
        this.dependencies.lessonAccounts.listBatches(
          institutionId,
          studentId,
          { page: 1, pageSize: 20 },
          scope,
        ),
        this.dependencies.lessonAccounts.listMovements(
          institutionId,
          studentId,
          { page: 1, pageSize: 20 },
          scope,
        ),
        this.dependencies.periodCards.listEntitlements(institutionId, {
          page: 1,
          pageSize: 100,
          studentId,
        }),
        this.dependencies.periodCards.listUsages(institutionId, {
          page: 1,
          pageSize: 100,
          studentId,
        }),
        this.dependencies.lessonCommerce.listForInstitution(institutionId, {
          page: 1,
          pageSize: 100,
          studentId,
        }),
        this.dependencies.lessonSessions.listStudentDeliveries(institutionId, studentId, scope, 50),
        this.dependencies.teachingResources.listStudentClassMemberships(
          institutionId,
          studentId,
          scope,
        ),
      ]);

    const now = this.clock();
    return {
      generatedAt: now.toISOString(),
      institution,
      student,
      guardians: guardianResult.items,
      summary: this.summary(
        account,
        batches.items,
        entitlements.items,
        orders.items,
        deliveries,
        now,
      ),
      lessonLedger: {
        account,
        recentBatches: batches.items,
        recentMovements: movements.items,
      },
      periodCards: {
        entitlements: entitlements.items,
        recentUsages: usages.items,
      },
      classes,
      deliveries,
      orders: orders.items,
    };
  }

  private summary(
    account: LessonAccount | null,
    batches: LessonBatch[],
    entitlements: PeriodCardEntitlement[],
    orders: LessonOrder[],
    deliveries: Student360Delivery[],
    now: Date,
  ) {
    const activePeriodCards = entitlements.filter((item) =>
      ['pending_activation', 'active'].includes(item.effectiveStatus),
    );
    const expiringBefore = now.getTime() + 30 * 24 * 60 * 60 * 1_000;
    const paidOrders = orders.filter((item) => ['completed', 'refunding'].includes(item.status));
    const completedDeliveries = deliveries.filter(
      (item) => item.session.status !== 'cancelled' && new Date(item.session.startsAt) <= now,
    );
    const lastOrderAt =
      paidOrders
        .map((item) => item.paidAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    const lastSessionAt =
      completedDeliveries
        .map((item) => item.session.startsAt)
        .sort()
        .at(-1) ?? null;
    return {
      lessonBalanceUnits: account?.balanceUnits ?? 0,
      lifetimeCreditedUnits: account?.lifetimeCreditedUnits ?? 0,
      lifetimeDebitedUnits: account?.lifetimeDebitedUnits ?? 0,
      activeLessonBatchCount:
        account?.activeBatchCount ?? batches.filter((item) => item.status === 'available').length,
      activePeriodCardCount: activePeriodCards.length,
      expiringPeriodCardCount: activePeriodCards.filter((item) => {
        if (!item.endsAt) return false;
        const time = new Date(item.endsAt).getTime();
        return time >= now.getTime() && time <= expiringBefore;
      }).length,
      upcomingSessionCount: deliveries.filter(
        (item) =>
          item.session.status !== 'cancelled' &&
          new Date(item.session.startsAt).getTime() > now.getTime(),
      ).length,
      attendedSessionCount: deliveries.filter((item) =>
        ['present', 'late'].includes(item.attendance.attendanceStatus),
      ).length,
      absentSessionCount: deliveries.filter((item) => item.attendance.attendanceStatus === 'absent')
        .length,
      consumedUnits: deliveries.reduce(
        (total, item) =>
          total +
          (item.attendance.consumptionStatus === 'consumed'
            ? (item.attendance.consumedUnits ?? 0)
            : 0),
        0,
      ),
      reversedUnits: deliveries.reduce(
        (total, item) =>
          total +
          (item.attendance.consumptionStatus === 'reversed'
            ? (item.attendance.consumedUnits ?? 0)
            : 0),
        0,
      ),
      paidOrderCount: paidOrders.length,
      paidAmountMinor: paidOrders.reduce((total, item) => total + item.amountMinor, 0),
      lastOrderAt,
      lastSessionAt,
    };
  }
}
