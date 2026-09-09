import assert from 'node:assert/strict';
import test from 'node:test';

import { planPeopleMigration, publicPeopleReport } from './people-phase2-lib.mjs';

const ids = {
  institution: '11111111-1111-4111-8111-111111111111',
  student: '22222222-2222-4222-8222-222222222222',
  guardian: '33333333-3333-4333-8333-333333333333',
  teacher: '44444444-4444-4444-8444-444444444444',
  account: '55555555-5555-4555-8555-555555555555',
  contract: '66666666-6666-4666-8666-666666666666',
  course: '77777777-7777-4777-8777-777777777777',
};
const now = new Date('2025-01-01T00:00:00Z');

function source(overrides = {}) {
  return {
    organization: [
      {
        name: '灵可教育服务有限公司',
        brandName: '灵可成长空间',
        logoUrl: 'https://example.test/organization.png',
        phone: '0571-88888888',
        address: '文具店二层',
        createdAt: now,
        updatedAt: now,
      },
    ],
    institutions: [
      {
        id: ids.institution,
        name: '合作书法',
        logoUrl: 'https://example.test/logo.png',
        intro: '机构介绍',
        qualificationItems: [{ imageUrl: 'https://example.test/license.png', caption: '资质' }],
        outcomeItems: [],
        contact: '王老师',
        sortOrder: 3,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    students: [
      {
        id: ids.student,
        guardianId: ids.guardian,
        name: '小满',
        grade: '三年级',
        school: '实验小学',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    guardians: [
      { id: ids.guardian, name: '林女士', phone: '138 0013 8000', createdAt: now, updatedAt: now },
    ],
    studentGuardians: [{ studentId: ids.student, guardianId: ids.guardian, relation: '母亲' }],
    teachers: [
      {
        id: ids.teacher,
        name: '陈老师',
        phone: null,
        title: '资深教师',
        education: '师范专业',
        specialties: ['书法'],
        isPinned: true,
        institutionId: ids.institution,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    accounts: [{ id: ids.account, guardianId: ids.guardian, teacherId: null }],
    courses: [{ id: ids.course, providerInstitutionId: ids.institution }],
    courseContracts: [
      {
        id: ids.contract,
        studentId: ids.student,
        institutionId: ids.institution,
        courseId: ids.course,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    roleAssignments: [],
    ...overrides,
  };
}

test('preserves organization-level people and creates explicit institution relationships', () => {
  const plan = planPeopleMigration(source());
  assert.equal(plan.readyToApply, true);
  assert.equal(plan.actions.organizationProfiles[0].brandName, '灵可成长空间');
  assert.equal(
    plan.actions.organizationProfiles[0].logoUrl,
    'https://example.test/organization.png',
  );
  assert.equal(plan.actions.institutions[0].type, 'partner');
  assert.equal(plan.actions.institutions[0].logoUrl, 'https://example.test/logo.png');
  assert.equal(plan.actions.institutions[0].intro, '机构介绍');
  assert.equal(plan.actions.institutions[0].contact, '王老师');
  assert.equal(plan.actions.students[0].fullName, '小满');
  assert.equal(plan.actions.studentInstitutions[0].source, 'legacy_contract');
  assert.equal(plan.actions.guardianBindings[0].relationship, '母亲');
  assert.equal(plan.actions.guardianBindings[0].isPrimary, true);
  assert.equal(plan.actions.guardianBindings[0].verificationStatus, 'unverified');
  assert.equal(plan.actions.guardians[0].phone, '+8613800138000');
  assert.equal(plan.actions.guardians[0].identityUserId, ids.account);
  assert.equal(plan.actions.teacherInstitutions.length, 1);
  assert.equal(plan.actions.teachers[0].title, '资深教师');
  assert.deepEqual(plan.actions.teachers[0].specialties, ['书法']);
  assert.equal(plan.actions.teachers[0].isPinned, true);
});

test('does not infer a provider from unrelated teaching fields', () => {
  const plan = planPeopleMigration(source({ courseContracts: [], roleAssignments: [] }));
  assert.equal(plan.actions.studentInstitutions.length, 0);
  assert.deepEqual(publicPeopleReport(plan).incompleteCounts, {
    STUDENT_INSTITUTION_UNRESOLVED: 1,
  });
});

test('uses course provider only when a contract has no explicit institution', () => {
  const fixture = source();
  fixture.courseContracts[0].institutionId = null;
  const plan = planPeopleMigration(fixture);
  assert.equal(plan.actions.studentInstitutions[0].source, 'legacy_course_provider');
});

test('quarantines an unlinked guardian with a non-canonical phone', () => {
  const fixture = source({ accounts: [] });
  fixture.guardians[0].phone = '010-88888888';
  const plan = planPeopleMigration(fixture);
  assert.equal(plan.actions.guardians.length, 0);
  assert.equal(plan.actions.guardianBindings.length, 0);
  assert.equal(publicPeopleReport(plan).incompleteCounts.GUARDIAN_CONTACT_INVALID, 1);
  assert.equal(publicPeopleReport(plan).incompleteCounts.GUARDIAN_BINDING_QUARANTINED, 1);
});

test('never puts phone numbers or names in the public report', () => {
  const report = JSON.stringify(publicPeopleReport(planPeopleMigration(source())));
  assert.equal(report.includes('13800138000'), false);
  assert.equal(report.includes('小满'), false);
});
