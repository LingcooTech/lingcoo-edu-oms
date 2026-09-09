import assert from 'node:assert/strict';
import test from 'node:test';

import { planLessonMigration, publicLessonReport } from './lesson-phase3-lib.mjs';

const ids = {
  institution: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222',
  course: '33333333-3333-4333-8333-333333333333',
  package: '44444444-4444-4444-8444-444444444444',
  contract: '55555555-5555-4555-8555-555555555555',
  movementGrant: '66666666-6666-4666-8666-666666666666',
  movementConsume: '77777777-7777-4777-8777-777777777777',
};
const start = new Date('2025-01-01T00:00:00Z');

function source(overrides = {}) {
  return {
    institutions: [{ id: ids.institution }],
    students: [{ id: ids.student }],
    courses: [{ id: ids.course, providerInstitutionId: ids.institution }],
    coursePackages: [
      {
        id: ids.package,
        courseId: ids.course,
        name: '旧系统书法课时包',
        description: '旧说明',
        billingType: 'lesson',
        lessonCount: 20,
        giftedLessonCount: 2,
        status: 'active',
        createdAt: start,
        updatedAt: start,
      },
    ],
    courseContracts: [
      {
        id: ids.contract,
        studentId: ids.student,
        institutionId: ids.institution,
        courseId: ids.course,
        classId: null,
        packageId: ids.package,
        orderId: '88888888-8888-4888-8888-888888888888',
        contractNo: 'LEGACY-001',
        title: '旧系统合同',
        lessonCount: 20,
        remainingLessonCount: 10,
        startsAt: null,
        endsAt: null,
        status: 'active',
        createdAt: start,
        updatedAt: start,
      },
    ],
    lessonMovements: [
      {
        id: ids.movementGrant,
        courseContractId: ids.contract,
        studentId: ids.student,
        operationId: 'legacy-grant',
        type: 'grant',
        units: 20,
        balanceBefore: 0,
        balanceAfter: 20,
        occurredAt: start,
      },
      {
        id: ids.movementConsume,
        courseContractId: ids.contract,
        studentId: ids.student,
        operationId: 'legacy-consume',
        type: 'consume',
        units: -10,
        balanceBefore: 20,
        balanceAfter: 10,
        occurredAt: new Date('2025-02-01T00:00:00Z'),
      },
    ],
    courseContractGifts: [],
    ...overrides,
  };
}

test('migrates current ordinary entitlement as institution opening batches', () => {
  const plan = planLessonMigration(source(), { now: new Date('2026-01-01T00:00:00Z') });
  assert.equal(plan.readyToApply, true);
  assert.deepEqual(plan.counts, {
    packageTemplates: 1,
    packageVersions: 1,
    accounts: 1,
    movements: 1,
    batches: 1,
  });
  assert.equal(plan.actions.accounts[0].balanceUnits, 10);
  assert.equal(plan.actions.batches[0].sourceType, 'migration_opening');
  assert.equal(plan.actions.batches[0].totalUnits, 10);
  assert.equal(plan.actions.batches[0].sourceMetadata.legacyOriginalUnits, 20);
  assert.equal(
    plan.actions.batches[0].sourceMetadata.legacyOrderId,
    '88888888-8888-4888-8888-888888888888',
  );
  assert.equal(plan.actions.packageTemplates[0].institutionId, ids.institution);
});

test('uses course provider only as evidence when contract institution is absent', () => {
  const fixture = source();
  fixture.courseContracts[0].institutionId = null;
  const plan = planLessonMigration(fixture);
  assert.equal(plan.actions.accounts[0].institutionId, ids.institution);
});

test('defers period entitlements instead of converting them to ordinary units', () => {
  const fixture = source();
  fixture.coursePackages[0].billingType = 'period';
  const report = publicLessonReport(planLessonMigration(fixture));
  assert.equal(report.incompleteCounts.PERIOD_ENTITLEMENT_DEFERRED, 1);
  assert.equal(report.counts.accounts, 0);
});

test('quarantines broken legacy ledger chains and balances', () => {
  const fixture = source();
  fixture.lessonMovements[1].balanceAfter = 11;
  const report = publicLessonReport(planLessonMigration(fixture));
  assert.equal(report.readyToApply, true);
  assert.equal(report.incompleteCounts.LEGACY_LEDGER_CHAIN_INVALID, 1);
  assert.equal(report.counts.accounts, 0);
});

test('does not invent ownership or import inactive positive balances', () => {
  const unresolved = source();
  unresolved.courseContracts[0].institutionId = null;
  unresolved.courses[0].providerInstitutionId = null;
  assert.equal(
    publicLessonReport(planLessonMigration(unresolved)).incompleteCounts
      .LESSON_INSTITUTION_UNRESOLVED,
    1,
  );
  const inactive = source();
  inactive.courseContracts[0].status = 'cancelled';
  assert.equal(
    publicLessonReport(planLessonMigration(inactive)).incompleteCounts
      .INACTIVE_CONTRACT_HAS_BALANCE,
    1,
  );
});

test('requires unlinked gifts to be reviewed and keeps public reports anonymous', () => {
  const fixture = source({
    courseContractGifts: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        courseContractId: ids.contract,
        grantedCourseContractId: null,
        studentId: ids.student,
        lessonCount: 2,
        status: 'active',
      },
    ],
  });
  const report = publicLessonReport(planLessonMigration(fixture));
  assert.equal(report.incompleteCounts.UNLINKED_GIFT_REQUIRES_REVIEW, 1);
  const text = JSON.stringify(report);
  assert.equal(text.includes('旧系统书法课时包'), false);
  assert.equal(text.includes(ids.contract), false);
  assert.equal(text.includes('LEGACY-001'), false);
});
