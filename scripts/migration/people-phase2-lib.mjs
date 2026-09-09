import { createHash } from 'node:crypto';

import { normalizeChinaPhone, stableDigest } from './identity-phase1-lib.mjs';

export const PEOPLE_TOOL_VERSION = '1.1.0';

function iso(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function deterministicUuid(namespace, ...parts) {
  const hex = createHash('sha256')
    .update([namespace, ...parts].join(':'))
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function profileIdentityMap(accounts, field, targetUserIds, incomplete) {
  const grouped = new Map();
  for (const account of accounts) {
    const profileId = account[field];
    if (!profileId || !targetUserIds.has(account.id)) continue;
    const ids = grouped.get(profileId) ?? [];
    ids.push(account.id);
    grouped.set(profileId, ids);
  }
  const result = new Map();
  for (const [profileId, userIds] of grouped) {
    if (userIds.length === 1) result.set(profileId, userIds[0]);
    else
      incomplete.push({
        code: 'PROFILE_IDENTITY_AMBIGUOUS',
        subjectType: field,
        subjectId: profileId,
      });
  }
  return result;
}

function status(value) {
  return value === 'active' ? 'active' : 'inactive';
}

function chooseRelationship(existing, candidate) {
  const precedence = { legacy_contract: 3, legacy_course_provider: 2, legacy_assignment: 1 };
  return !existing || precedence[candidate.source] > precedence[existing.source]
    ? candidate
    : existing;
}

export function planPeopleMigration(source, options = {}) {
  const blockers = [];
  const incomplete = [];
  const exceptions = [];
  const targetUserIds = options.targetUserIds ?? new Set(source.accounts.map((row) => row.id));
  const guardianUsers = profileIdentityMap(
    source.accounts,
    'guardianId',
    targetUserIds,
    incomplete,
  );
  const teacherUsers = profileIdentityMap(source.accounts, 'teacherId', targetUserIds, incomplete);

  if (source.organization.length > 1) {
    blockers.push({
      code: 'SOURCE_ORGANIZATION_NOT_SINGLETON',
      subjectType: 'organization',
      subjectId: null,
    });
  }
  const organizationProfiles = source.organization.slice(0, 1).map((row) => ({
    name: row.name,
    brandName: row.brandName || row.name,
    logoUrl: row.logoUrl || null,
    phone: row.phone || null,
    address: row.address || null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }));

  const institutions = source.institutions.map((row) => {
    return {
      id: row.id,
      name: row.name,
      type: 'partner',
      status: status(row.status),
      contactName: null,
      contactPhone: null,
      address: null,
      logoUrl: row.logoUrl || null,
      intro: row.intro || '',
      qualificationItems: Array.isArray(row.qualificationItems) ? row.qualificationItems : [],
      outcomeItems: Array.isArray(row.outcomeItems) ? row.outcomeItems : [],
      contact: row.contact || null,
      sortOrder: row.sortOrder ?? 0,
      notes: null,
      revision: 1,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  });
  if (institutions.length) {
    exceptions.push({
      code: 'INSTITUTION_TYPE_REQUIRES_BUSINESS_REVIEW',
      subjectType: 'institutionSet',
      subjectId: null,
      count: institutions.length,
    });
  }

  const students = source.students.map((row) => ({
    id: row.id,
    fullName: row.name,
    preferredName: null,
    grade: row.grade || null,
    school: row.school || null,
    gender: 'unknown',
    birthDate: null,
    notes: null,
    status: status(row.status),
    revision: 1,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }));

  const importableGuardians = new Set();
  const guardians = [];
  for (const row of source.guardians) {
    const identityUserId = guardianUsers.get(row.id) ?? null;
    const phone = normalizeChinaPhone(row.phone);
    if (!phone && !identityUserId) {
      incomplete.push({
        code: 'GUARDIAN_CONTACT_INVALID',
        subjectType: 'guardian',
        subjectId: row.id,
      });
      continue;
    }
    if (!phone && row.phone) {
      incomplete.push({
        code: 'GUARDIAN_PHONE_DROPPED',
        subjectType: 'guardian',
        subjectId: row.id,
      });
    }
    importableGuardians.add(row.id);
    guardians.push({
      id: row.id,
      fullName: row.name,
      phone,
      email: null,
      identityUserId,
      notes: null,
      status: 'active',
      revision: 1,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    });
  }

  const teachers = source.teachers.map((row) => ({
    id: row.id,
    fullName: row.name,
    identityUserId: teacherUsers.get(row.id) ?? null,
    phone: normalizeChinaPhone(row.phone),
    title: row.title || null,
    avatarUrl: row.avatarUrl || null,
    tagline: row.tagline || null,
    wechatQrUrl: row.wechatQrUrl || null,
    education: row.education || '',
    teachingExperience: row.teachingExperience || '',
    teachingStyle: row.teachingStyle || '',
    achievements: row.achievements || '',
    teachingYears: row.teachingYears || null,
    studentCount: row.studentCount || null,
    retentionRate: row.retentionRate || null,
    teachingPhilosophy: row.teachingPhilosophy || '',
    classPhotoUrls: Array.isArray(row.classPhotoUrls) ? row.classPhotoUrls : [],
    studentWorkUrls: Array.isArray(row.studentWorkUrls) ? row.studentWorkUrls : [],
    parentTestimonials: Array.isArray(row.parentTestimonials) ? row.parentTestimonials : [],
    bio: row.bio || '',
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    isPinned: Boolean(row.isPinned),
    isTrialConsultant: Boolean(row.isTrialConsultant),
    status: status(row.status),
    revision: 1,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }));
  for (const row of source.teachers) {
    if (row.phone && !normalizeChinaPhone(row.phone)) {
      incomplete.push({ code: 'TEACHER_PHONE_DROPPED', subjectType: 'teacher', subjectId: row.id });
    }
  }

  const bindingPairs = new Map();
  for (const row of source.studentGuardians) {
    bindingPairs.set(`${row.studentId}:${row.guardianId}`, {
      studentId: row.studentId,
      guardianId: row.guardianId,
      relationship: row.relation || 'guardian',
      isPrimary: false,
    });
  }
  for (const student of source.students) {
    if (!student.guardianId) continue;
    const key = `${student.id}:${student.guardianId}`;
    const current = bindingPairs.get(key);
    bindingPairs.set(key, {
      studentId: student.id,
      guardianId: student.guardianId,
      relationship: current?.relationship ?? 'guardian',
      isPrimary: true,
    });
  }
  const guardianBindings = [...bindingPairs.values()]
    .filter((row) => {
      if (importableGuardians.has(row.guardianId)) return true;
      incomplete.push({
        code: 'GUARDIAN_BINDING_QUARANTINED',
        subjectType: 'studentGuardian',
        subjectId: `${row.studentId}:${row.guardianId}`,
      });
      return false;
    })
    .map((row) => ({
      id: deterministicUuid('legacy-student-guardian', row.studentId, row.guardianId),
      ...row,
      status: 'active',
      verificationStatus: 'unverified',
      verificationSource: 'legacy_import',
      verifiedAt: null,
      revokedAt: null,
      revision: 1,
    }));

  const courseProviders = new Map(source.courses.map((row) => [row.id, row.providerInstitutionId]));
  const relationships = new Map();
  for (const contract of source.courseContracts) {
    const institutionId = contract.institutionId ?? courseProviders.get(contract.courseId) ?? null;
    if (!institutionId) continue;
    const sourceKind = contract.institutionId ? 'legacy_contract' : 'legacy_course_provider';
    const candidate = {
      studentId: contract.studentId,
      institutionId,
      status: status(contract.status),
      joinedAt: iso(contract.createdAt),
      endedAt: contract.status === 'active' ? null : iso(contract.updatedAt),
      revision: 1,
      source: sourceKind,
      sourceReference: `course_contract:${contract.id}`,
    };
    const key = `${candidate.studentId}:${candidate.institutionId}`;
    relationships.set(key, chooseRelationship(relationships.get(key), candidate));
  }

  const guardiansToStudents = new Map();
  for (const binding of bindingPairs.values()) {
    const ids = guardiansToStudents.get(binding.guardianId) ?? [];
    ids.push(binding.studentId);
    guardiansToStudents.set(binding.guardianId, ids);
  }
  for (const assignment of source.roleAssignments) {
    if (assignment.role !== 'parent' || !assignment.guardianId || !assignment.institutionId)
      continue;
    for (const studentId of guardiansToStudents.get(assignment.guardianId) ?? []) {
      const candidate = {
        studentId,
        institutionId: assignment.institutionId,
        status: status(assignment.status),
        joinedAt: iso(assignment.createdAt),
        endedAt: assignment.status === 'active' ? null : iso(assignment.updatedAt),
        revision: 1,
        source: 'legacy_assignment',
        sourceReference: `account_role_assignment:${assignment.id}`,
      };
      const key = `${studentId}:${assignment.institutionId}`;
      relationships.set(key, chooseRelationship(relationships.get(key), candidate));
    }
  }
  const studentInstitutions = [...relationships.values()];
  const relatedStudentIds = new Set(studentInstitutions.map((row) => row.studentId));
  for (const student of students) {
    if (!relatedStudentIds.has(student.id)) {
      incomplete.push({
        code: 'STUDENT_INSTITUTION_UNRESOLVED',
        subjectType: 'student',
        subjectId: student.id,
      });
    }
  }

  const institutionIds = new Set(institutions.map((row) => row.id));
  const teacherInstitutions = source.teachers
    .filter((row) => row.institutionId && institutionIds.has(row.institutionId))
    .map((row) => ({
      teacherId: row.id,
      institutionId: row.institutionId,
      status: status(row.status),
      revision: 1,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    }));

  const actions = {
    organizationProfiles,
    institutions,
    students,
    guardians,
    guardianBindings,
    teachers,
    teacherInstitutions,
    studentInstitutions,
  };
  return {
    formatVersion: 1,
    toolVersion: PEOPLE_TOOL_VERSION,
    sourceDigest: stableDigest(source),
    blockers,
    incomplete,
    exceptions,
    actions,
    counts: Object.fromEntries(Object.entries(actions).map(([key, rows]) => [key, rows.length])),
    readyToApply: blockers.length === 0,
  };
}

export function publicPeopleReport(plan, extra = {}) {
  return {
    formatVersion: plan.formatVersion,
    toolVersion: plan.toolVersion,
    sourceDigest: plan.sourceDigest,
    readyToApply: plan.readyToApply,
    counts: plan.counts,
    blockerCounts: countCodes(plan.blockers),
    incompleteCounts: countCodes(plan.incomplete),
    exceptionCounts: countCodes(plan.exceptions),
    ...extra,
  };
}

function countCodes(items) {
  const result = {};
  for (const item of items) result[item.code] = (result[item.code] ?? 0) + (item.count ?? 1);
  return result;
}
