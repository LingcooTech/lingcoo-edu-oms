import { createHash } from 'node:crypto';

import { stableDigest } from './identity-phase1-lib.mjs';

export const LESSON_TOOL_VERSION = '1.0.0';

function deterministicUuid(namespace, ...parts) {
  const hex = createHash('sha256')
    .update([namespace, ...parts].join(':'))
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function iso(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function codeCounts(rows) {
  const result = {};
  for (const row of rows) result[row.code] = (result[row.code] ?? 0) + 1;
  return result;
}

function issue(code, subjectType, subjectId = null) {
  return { code, subjectType, subjectId };
}

function resolveInstitution(contract, courseById) {
  return contract.institutionId ?? courseById.get(contract.courseId)?.providerInstitutionId ?? null;
}

function validateLegacyMovements(contract, movements, incomplete) {
  if (!movements.length) {
    if (contract.remainingLessonCount > 0) {
      incomplete.push(issue('LEGACY_LEDGER_EVIDENCE_MISSING', 'courseContract', contract.id));
      return false;
    }
    return true;
  }
  let previousAfter = null;
  for (const movement of movements) {
    if (
      movement.studentId !== contract.studentId ||
      !Number.isInteger(movement.units) ||
      movement.units === 0 ||
      !Number.isInteger(movement.balanceBefore) ||
      !Number.isInteger(movement.balanceAfter) ||
      movement.balanceBefore < 0 ||
      movement.balanceAfter < 0 ||
      movement.balanceAfter !== movement.balanceBefore + movement.units ||
      (previousAfter !== null && movement.balanceBefore !== previousAfter)
    ) {
      incomplete.push(issue('LEGACY_LEDGER_CHAIN_INVALID', 'courseContract', contract.id));
      return false;
    }
    previousAfter = movement.balanceAfter;
  }
  if (previousAfter !== contract.remainingLessonCount) {
    incomplete.push(issue('LEGACY_LEDGER_BALANCE_MISMATCH', 'courseContract', contract.id));
    return false;
  }
  return true;
}

export function planLessonMigration(source, target = {}) {
  const blockers = [];
  const incomplete = [];
  const exceptions = [];
  const targetInstitutionIds =
    target.institutionIds ?? new Set(source.institutions.map((row) => row.id));
  const targetStudentIds = target.studentIds ?? new Set(source.students.map((row) => row.id));
  const courseById = new Map(source.courses.map((row) => [row.id, row]));
  const packageById = new Map(source.coursePackages.map((row) => [row.id, row]));
  const movementsByContract = new Map();
  const operationIds = new Set();
  for (const movement of source.lessonMovements) {
    if (operationIds.has(movement.operationId)) {
      blockers.push(issue('LEGACY_MOVEMENT_OPERATION_DUPLICATE', 'lessonMovement', movement.id));
    }
    operationIds.add(movement.operationId);
    const rows = movementsByContract.get(movement.courseContractId) ?? [];
    rows.push(movement);
    movementsByContract.set(movement.courseContractId, rows);
  }
  for (const rows of movementsByContract.values()) {
    rows.sort((left, right) => {
      const time = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
      return time || left.id.localeCompare(right.id);
    });
  }

  const templatePairs = new Map();
  const eligibleContracts = [];
  const now = target.now ? new Date(target.now) : new Date();
  for (const contract of source.courseContracts) {
    const institutionId = resolveInstitution(contract, courseById);
    if (!institutionId) {
      incomplete.push(issue('LESSON_INSTITUTION_UNRESOLVED', 'courseContract', contract.id));
      continue;
    }
    if (!targetInstitutionIds.has(institutionId)) {
      blockers.push(issue('TARGET_INSTITUTION_MISSING', 'courseContract', contract.id));
      continue;
    }
    if (!targetStudentIds.has(contract.studentId)) {
      blockers.push(issue('TARGET_STUDENT_MISSING', 'courseContract', contract.id));
      continue;
    }
    if (
      !Number.isInteger(contract.lessonCount) ||
      !Number.isInteger(contract.remainingLessonCount) ||
      contract.lessonCount < 0 ||
      contract.remainingLessonCount < 0 ||
      contract.remainingLessonCount > contract.lessonCount
    ) {
      blockers.push(issue('LEGACY_CONTRACT_UNITS_INVALID', 'courseContract', contract.id));
      continue;
    }
    const coursePackage = contract.packageId ? packageById.get(contract.packageId) : null;
    if (coursePackage?.billingType === 'period') {
      incomplete.push(issue('PERIOD_ENTITLEMENT_DEFERRED', 'courseContract', contract.id));
      continue;
    }
    if (contract.status !== 'active' && contract.remainingLessonCount > 0) {
      incomplete.push(issue('INACTIVE_CONTRACT_HAS_BALANCE', 'courseContract', contract.id));
      continue;
    }
    if (contract.endsAt && new Date(contract.endsAt) < now && contract.remainingLessonCount > 0) {
      incomplete.push(issue('EXPIRED_CONTRACT_HAS_BALANCE', 'courseContract', contract.id));
      continue;
    }
    const ledgerIsValid = validateLegacyMovements(
      contract,
      movementsByContract.get(contract.id) ?? [],
      incomplete,
    );
    if (!ledgerIsValid) continue;
    if (coursePackage) {
      if (
        !Number.isInteger(coursePackage.lessonCount) ||
        !Number.isInteger(coursePackage.giftedLessonCount) ||
        coursePackage.lessonCount <= 0 ||
        coursePackage.giftedLessonCount < 0
      ) {
        blockers.push(issue('LEGACY_PACKAGE_UNITS_INVALID', 'coursePackage', coursePackage.id));
        continue;
      }
      templatePairs.set(`${coursePackage.id}:${institutionId}`, { coursePackage, institutionId });
    }
    if (contract.remainingLessonCount === 0) {
      exceptions.push(issue('ZERO_BALANCE_CONTRACT_NOT_OPENED', 'courseContract', contract.id));
      continue;
    }
    eligibleContracts.push({ contract, institutionId, coursePackage });
  }

  for (const gift of source.courseContractGifts) {
    if (gift.lessonCount <= 0) {
      blockers.push(issue('LEGACY_GIFT_UNITS_INVALID', 'courseContractGift', gift.id));
    } else if (!gift.grantedCourseContractId) {
      incomplete.push(issue('UNLINKED_GIFT_REQUIRES_REVIEW', 'courseContractGift', gift.id));
    }
  }

  const packageTemplateId = new Map();
  const packageTemplates = [];
  const packageVersions = [];
  for (const { coursePackage, institutionId } of templatePairs.values()) {
    const id = deterministicUuid('p3-package-template', coursePackage.id, institutionId);
    const versionId = deterministicUuid('p3-package-version', coursePackage.id, institutionId, '1');
    packageTemplateId.set(`${coursePackage.id}:${institutionId}`, { id, versionId });
    const template = {
      id,
      institutionId,
      name: coursePackage.name,
      description: coursePackage.description || null,
      baseUnits: coursePackage.lessonCount,
      bonusUnits: coursePackage.giftedLessonCount,
      status: coursePackage.status === 'active' ? 'active' : 'inactive',
      revision: 1,
      createdAt: iso(coursePackage.createdAt),
      updatedAt: iso(coursePackage.updatedAt),
    };
    packageTemplates.push(template);
    packageVersions.push({
      id: versionId,
      packageId: id,
      institutionId,
      version: 1,
      name: template.name,
      description: template.description,
      baseUnits: template.baseUnits,
      bonusUnits: template.bonusUnits,
      status: template.status,
      createdAt: template.createdAt,
    });
  }

  const grouped = new Map();
  for (const row of eligibleContracts) {
    const key = `${row.contract.studentId}:${row.institutionId}`;
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }
  const accounts = [];
  const batches = [];
  const movements = [];
  for (const [key, rows] of grouped) {
    rows.sort((left, right) => {
      const time =
        new Date(left.contract.createdAt).getTime() - new Date(right.contract.createdAt).getTime();
      return time || left.contract.id.localeCompare(right.contract.id);
    });
    const [studentId, institutionId] = key.split(':');
    const accountId = deterministicUuid('p3-lesson-account', studentId, institutionId);
    let balance = 0;
    let sequence = 0;
    for (const { contract, coursePackage } of rows) {
      sequence += 1;
      const movementId = deterministicUuid('p3-opening-movement', contract.id);
      const batchId = deterministicUuid('p3-opening-batch', contract.id);
      const units = contract.remainingLessonCount;
      const before = balance;
      balance += units;
      const mappedTemplate = coursePackage
        ? packageTemplateId.get(`${coursePackage.id}:${institutionId}`)
        : null;
      movements.push({
        id: movementId,
        accountId,
        institutionId,
        studentId,
        sequence,
        type: 'grant',
        direction: 'credit',
        units,
        balanceBeforeUnits: before,
        balanceAfterUnits: balance,
        reason: '旧系统普通课时期初迁移',
        sourceReference: `course_contract:${contract.id}`,
        actorId: null,
        occurredAt: iso(contract.createdAt),
        metadata: { legacyCourseContractId: contract.id },
        createdAt: iso(contract.createdAt),
      });
      batches.push({
        id: batchId,
        accountId,
        institutionId,
        studentId,
        originMovementId: movementId,
        templateId: mappedTemplate?.id ?? null,
        templateVersionId: mappedTemplate?.versionId ?? null,
        templateRevision: mappedTemplate ? 1 : null,
        templateName: coursePackage?.name ?? null,
        sourceType: 'migration_opening',
        sourceReference: `course_contract:${contract.id}`,
        sourceMetadata: {
          legacyCourseContractId: contract.id,
          legacyContractNo: contract.contractNo,
          legacyCourseId: contract.courseId,
          legacyClassId: contract.classId,
          legacyPackageId: contract.packageId,
          legacyOrderId: contract.orderId,
          legacyOriginalUnits: contract.lessonCount,
          legacyRemainingUnits: contract.remainingLessonCount,
          legacyStartsAt: iso(contract.startsAt),
          legacyEndsAt: iso(contract.endsAt),
        },
        reason: '旧系统普通课时期初迁移',
        baseUnits: units,
        bonusUnits: 0,
        totalUnits: units,
        consumedUnits: 0,
        withdrawnUnits: 0,
        remainingUnits: units,
        status: 'available',
        grantedAt: iso(contract.createdAt),
        createdAt: iso(contract.createdAt),
        updatedAt: iso(contract.updatedAt),
      });
    }
    accounts.push({
      id: accountId,
      institutionId,
      studentId,
      balanceUnits: balance,
      lifetimeCreditedUnits: balance,
      lifetimeDebitedUnits: 0,
      lastSequence: sequence,
      revision: 1,
      createdAt: rows[0].contract.createdAt,
      updatedAt: rows.at(-1).contract.updatedAt,
    });
  }

  const actions = { packageTemplates, packageVersions, accounts, movements, batches };
  return {
    formatVersion: 1,
    toolVersion: LESSON_TOOL_VERSION,
    sourceDigest: stableDigest(source),
    blockers,
    incomplete,
    exceptions,
    actions,
    counts: Object.fromEntries(Object.entries(actions).map(([key, rows]) => [key, rows.length])),
    readyToApply: blockers.length === 0,
  };
}

export function publicLessonReport(plan, extra = {}) {
  return {
    formatVersion: plan.formatVersion,
    toolVersion: plan.toolVersion,
    sourceDigest: plan.sourceDigest,
    readyToApply: plan.readyToApply,
    counts: plan.counts,
    blockerCounts: codeCounts(plan.blockers),
    incompleteCounts: codeCounts(plan.incomplete),
    exceptionCounts: codeCounts(plan.exceptions),
    ...extra,
  };
}
