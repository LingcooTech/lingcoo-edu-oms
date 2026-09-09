import { randomUUID } from 'node:crypto';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { createAccessControlService } from '../src/modules/access-control/public.js';
import {
  accessEducationAssignments,
  accessUserRoles,
} from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import { createAuditService } from '../src/modules/audit/public.js';
import { createIdentityService, type IdentityService } from '../src/modules/identity/public.js';
import { createLessonAccountProvisioner } from '../src/modules/lesson-accounts/public.js';
import { createOrganizationService } from '../src/modules/organization/public.js';
import { organizationInstitutions } from '../src/modules/organization/infrastructure/persistence/organization.schema.js';
import { lessonAccounts } from '../src/modules/lesson-accounts/infrastructure/persistence/lesson-accounts.schema.js';
import { createPeopleService } from '../src/modules/people/public.js';
import {
  peopleGuardians,
  peopleStudentGuardians,
  peopleStudentInstitutions,
  peopleStudents,
  peopleTeacherInstitutions,
  peopleTeachers,
} from '../src/modules/people/infrastructure/persistence/people.schema.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /p2_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /p2_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `p2_session=${session}; p2_csrf=${csrf}`, csrf };
}

suite('P2 organization and people', () => {
  let database: DatabaseHandle;
  let identity: IdentityService;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let access: ReturnType<typeof createAccessControlService>;
  let ownerHeaders: ReturnType<typeof cookies>;
  const userIds: string[] = [];

  async function cleanup() {
    await database.db.execute(sql`truncate table
      lesson_movement_allocations,
      lesson_batches,
      lesson_movements,
      lesson_accounts,
      lesson_package_versions,
      lesson_package_templates
      cascade`);
    await database.db.delete(accessEducationAssignments);
    await database.db.delete(peopleStudentGuardians);
    await database.db.delete(peopleTeacherInstitutions);
    await database.db.delete(peopleStudentInstitutions);
    await database.db.delete(peopleGuardians);
    await database.db.delete(peopleTeachers);
    await database.db.delete(peopleStudents);
    await database.db.delete(organizationInstitutions);
    if (userIds.length) {
      await database.db.delete(accessUserRoles).where(inArray(accessUserRoles.userId, userIds));
      await database.db
        .delete(identityActionTokens)
        .where(inArray(identityActionTokens.userId, userIds));
      await database.db.delete(identitySessions).where(inArray(identitySessions.userId, userIds));
      await database.db
        .delete(identityPasswordCredentials)
        .where(inArray(identityPasswordCredentials.userId, userIds));
      await database.db.delete(identityUsers).where(inArray(identityUsers.id, userIds));
    }
  }

  async function createUser(prefix: string) {
    const user = await identity.createUser({
      email: `${prefix}-${randomUUID()}@example.com`,
      password: 'p2-secure-password',
    });
    userIds.push(user.id);
    return user;
  }

  async function login(email: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: 'p2-secure-password' },
    });
    expect(response.statusCode, response.body).toBe(200);
    return cookies(response.headers['set-cookie']);
  }

  async function assignRole(userId: string, roleKey: string) {
    const role = (await access.listRoles()).find((item) => item.key === roleKey)!;
    await database.db.insert(accessUserRoles).values({ userId, roleId: role.id });
  }

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      AUTH_COOKIE_NAME: 'p2_session',
      AUTH_CSRF_COOKIE_NAME: 'p2_csrf',
    });
    database = createDatabase(environment.DATABASE_URL);
    identity = createIdentityService({ database, environment });
    const audit = createAuditService({ database });
    const organization = createOrganizationService({ database, audit });
    const people = createPeopleService({
      database,
      institutions: organization,
      identity,
      audit,
      lessonAccounts: createLessonAccountProvisioner({ database, audit }),
    });
    access = createAccessControlService({
      database,
      identity,
      audit,
      educationDirectory: people,
    });
    await cleanup();
    await access.synchronizeSystemAccess();
    const owner = await createUser('owner');
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    ownerHeaders = await login(owner.email!);
  });

  afterAll(async () => {
    if (!database) return;
    await cleanup();
    await app.close();
  });

  it('keeps one organization student visible in two explicitly related institutions', async () => {
    const profile = await app.inject({
      method: 'GET',
      url: '/api/organization',
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(profile.statusCode, profile.body).toBe(200);
    const updatedProfile = await app.inject({
      method: 'PATCH',
      url: '/api/organization',
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: {
        expectedRevision: profile.json().revision,
        name: '灵可成长空间有限公司',
        brandName: '灵可成长空间',
        logoUrl: 'https://example.test/organization-logo.png',
        phone: '0571-88888888',
        address: '文具店二层',
        operationMode: 'mixed',
      },
    });
    expect(updatedProfile.statusCode, updatedProfile.body).toBe(200);
    expect(updatedProfile.json()).toMatchObject({
      brandName: '灵可成长空间',
      logoUrl: 'https://example.test/organization-logo.png',
      revision: profile.json().revision + 1,
    });

    const createInstitution = (name: string, type: 'self_operated' | 'partner') =>
      app.inject({
        method: 'POST',
        url: '/api/institutions',
        headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
        payload: {
          name,
          type,
          logoUrl: 'https://example.test/institution-logo.png',
          intro: '专注儿童成长服务',
          qualificationItems: [
            { imageUrl: 'https://example.test/license.png', caption: '办学资质' },
          ],
          outcomeItems: [{ imageUrl: 'https://example.test/outcome.png', caption: '教学成果' }],
          contact: '王老师 13800138000',
          sortOrder: 3,
        },
      });
    const a = await createInstitution('成长空间自营', 'self_operated');
    const b = await createInstitution('合作书法机构', 'partner');
    expect(a.statusCode, a.body).toBe(201);
    expect(b.statusCode, b.body).toBe(201);
    expect(a.json()).toMatchObject({
      intro: '专注儿童成长服务',
      qualificationItems: [{ imageUrl: 'https://example.test/license.png', caption: '办学资质' }],
      sortOrder: 3,
    });
    const aId = a.json().id as string;
    const bId = b.json().id as string;

    const created = await app.inject({
      method: 'POST',
      url: `/api/institutions/${aId}/students`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { fullName: '林小满', grade: '三年级', school: '实验小学' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const studentId = created.json().id as string;
    expect(created.json()).toMatchObject({ institutionId: aId, grade: '三年级' });
    const [firstAccount] = await database.db
      .select()
      .from(lessonAccounts)
      .where(and(eq(lessonAccounts.institutionId, aId), eq(lessonAccounts.studentId, studentId)));
    expect(firstAccount).toMatchObject({ balanceUnits: 0, revision: 1 });

    const beforeLink = await app.inject({
      method: 'GET',
      url: `/api/institutions/${bId}/students`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(beforeLink.json()).toMatchObject({ total: 0, items: [] });
    const linked = await app.inject({
      method: 'POST',
      url: `/api/institutions/${bId}/student-services`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { studentId },
    });
    expect(linked.statusCode, linked.body).toBe(201);
    expect(linked.json()).toMatchObject({ id: studentId, institutionId: bId });
    const [partnerAccount] = await database.db
      .select()
      .from(lessonAccounts)
      .where(and(eq(lessonAccounts.institutionId, bId), eq(lessonAccounts.studentId, studentId)));
    expect(partnerAccount).toMatchObject({ balanceUnits: 0, revision: 1 });

    const aList = await app.inject({
      method: 'GET',
      url: `/api/institutions/${aId}/students`,
      headers: { cookie: ownerHeaders.cookie },
    });
    const bList = await app.inject({
      method: 'GET',
      url: `/api/institutions/${bId}/students`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(aList.json().total).toBe(1);
    expect(bList.json().total).toBe(1);

    const guardianUser = await createUser('guardian');
    const guardian = await app.inject({
      method: 'POST',
      url: `/api/institutions/${aId}/students/${studentId}/guardians`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: {
        fullName: '林女士',
        phone: '13800138000',
        identityUserId: guardianUser.id,
        relationship: '母亲',
        isPrimary: true,
      },
    });
    expect(guardian.statusCode, guardian.body).toBe(201);
    expect(guardian.json()).toMatchObject({
      status: 'active',
      verificationStatus: 'verified',
      verificationSource: 'admin',
    });
    expect(guardian.json().verifiedAt).toBeTruthy();

    await assignRole(guardianUser.id, 'parent');
    await access.replaceEducationAssignments(
      guardianUser.id,
      [
        {
          role: 'parent',
          institutionId: aId,
          teacherId: null,
          guardianId: guardian.json().guardian.id,
          active: true,
          teacherCapabilities: {
            createClassSession: false,
            createAdHocSession: false,
            manageSessionRoster: false,
            enrollStudents: false,
            viewAllStudents: false,
            setLessonUnits: false,
            manageClasses: false,
          },
        },
      ],
      { actorType: 'system' },
    );
    const parentHeaders = await login(guardianUser.email!);
    const child = await app.inject({
      method: 'GET',
      url: `/api/institutions/${aId}/students`,
      headers: { cookie: parentHeaders.cookie },
    });
    expect(child.statusCode, child.body).toBe(200);
    expect(child.json()).toMatchObject({ total: 1, items: [{ id: studentId }] });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/institutions/${bId}/students`,
          headers: { cookie: parentHeaders.cookie },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('normalizes and enforces institution types in self-operated-only mode', async () => {
    const current = await app.inject({
      method: 'GET',
      url: '/api/organization',
      headers: { cookie: ownerHeaders.cookie },
    });
    const profile = current.json();
    const switched = await app.inject({
      method: 'PATCH',
      url: '/api/organization',
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: {
        expectedRevision: profile.revision,
        name: profile.name,
        brandName: profile.brandName,
        logoUrl: profile.logoUrl,
        phone: profile.phone,
        address: profile.address,
        operationMode: 'self_operated_only',
      },
    });
    expect(switched.statusCode, switched.body).toBe(200);
    expect(switched.json().operationMode).toBe('self_operated_only');

    const existing = await database.db.select().from(organizationInstitutions);
    expect(existing.length).toBeGreaterThan(0);
    expect(existing.every((institution) => institution.type === 'self_operated')).toBe(true);

    const attemptedPartner = await app.inject({
      method: 'POST',
      url: '/api/institutions',
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { name: `被强制自营-${randomUUID()}`, type: 'partner' },
    });
    expect(attemptedPartner.statusCode, attemptedPartner.body).toBe(201);
    expect(attemptedPartner.json().type).toBe('self_operated');

    const target = existing[0]!;
    const attemptedUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${target.id}`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { expectedRevision: target.revision, type: 'partner' },
    });
    expect(attemptedUpdate.statusCode, attemptedUpdate.body).toBe(200);
    expect(attemptedUpdate.json().type).toBe('self_operated');
  });

  it('rejects fabricated assignments and keeps teachers from seeing all institution students in P2', async () => {
    const [institution] = await database.db.select().from(organizationInstitutions).limit(1);
    const teacherUser = await createUser('teacher');
    await assignRole(teacherUser.id, 'teacher');
    await expect(
      access.replaceEducationAssignments(
        teacherUser.id,
        [
          {
            role: 'teacher',
            institutionId: institution!.id,
            teacherId: randomUUID(),
            guardianId: null,
            active: true,
            teacherCapabilities: {
              createClassSession: false,
              createAdHocSession: false,
              manageSessionRoster: false,
              enrollStudents: false,
              viewAllStudents: true,
              setLessonUnits: false,
              manageClasses: false,
            },
          },
        ],
        { actorType: 'system' },
      ),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_TEACHER_INVALID' });

    const teacher = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institution!.id}/teachers`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: {
        fullName: '周老师',
        identityUserId: teacherUser.id,
        title: '资深书法教师',
        teachingExperience: '八年教学经验',
        specialties: ['书法', '硬笔'],
        isPinned: true,
      },
    });
    expect(teacher.statusCode, teacher.body).toBe(201);
    expect(teacher.json()).toMatchObject({
      title: '资深书法教师',
      teachingExperience: '八年教学经验',
      specialties: ['书法', '硬笔'],
      isPinned: true,
    });
    const updatedTeacher = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institution!.id}/teachers/${teacher.json().id}`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: {
        expectedRevision: teacher.json().revision,
        teachingPhilosophy: '尊重每个孩子的成长节奏',
      },
    });
    expect(updatedTeacher.statusCode, updatedTeacher.body).toBe(200);
    expect(updatedTeacher.json()).toMatchObject({
      teachingPhilosophy: '尊重每个孩子的成长节奏',
      revision: teacher.json().revision + 1,
    });
    await access.replaceEducationAssignments(
      teacherUser.id,
      [
        {
          role: 'teacher',
          institutionId: institution!.id,
          teacherId: teacher.json().id,
          guardianId: null,
          active: true,
          teacherCapabilities: {
            createClassSession: false,
            createAdHocSession: false,
            manageSessionRoster: false,
            enrollStudents: false,
            viewAllStudents: true,
            setLessonUnits: false,
            manageClasses: false,
          },
        },
      ],
      { actorType: 'system' },
    );
    const headers = await login(teacherUser.email!);
    const list = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institution!.id}/students`,
      headers: { cookie: headers.cookie },
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json()).toMatchObject({ total: 0, items: [] });
  });

  it('enforces optimistic revisions and database relationship constraints', async () => {
    const [institution] = await database.db.select().from(organizationInstitutions).limit(1);
    const list = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institution!.id}/students`,
      headers: { cookie: ownerHeaders.cookie },
    });
    const student = list.json().items[0];
    const [legacyGuardian] = await database.db
      .insert(peopleGuardians)
      .values({ fullName: '待核验家长', phone: '+8613700137000' })
      .returning();
    const [legacyBinding] = await database.db
      .insert(peopleStudentGuardians)
      .values({
        studentId: student.id,
        guardianId: legacyGuardian!.id,
        relationship: '监护人',
      })
      .returning();
    const verificationUrl = `/api/institutions/${institution!.id}/students/${student.id}/guardian-links/${legacyBinding!.id}/verification`;
    const verified = await app.inject({
      method: 'PATCH',
      url: verificationUrl,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { expectedRevision: legacyBinding!.revision },
    });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json()).toMatchObject({
      verificationStatus: 'verified',
      verificationSource: 'admin',
      revision: legacyBinding!.revision + 1,
    });
    expect(verified.json().verifiedAt).toBeTruthy();
    const duplicateVerification = await app.inject({
      method: 'PATCH',
      url: verificationUrl,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { expectedRevision: legacyBinding!.revision },
    });
    expect(duplicateVerification.statusCode).toBe(409);

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institution!.id}/students/${student.id}`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { expectedRevision: student.revision, preferredName: '小满' },
    });
    expect(first.statusCode, first.body).toBe(200);
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/institutions/${institution!.id}/students/${student.id}`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { expectedRevision: student.revision, preferredName: '旧覆盖' },
    });
    expect(stale.statusCode).toBe(409);
    await expect(database.db.execute(sql`delete from organization_institutions`)).rejects.toThrow();
  });
});
