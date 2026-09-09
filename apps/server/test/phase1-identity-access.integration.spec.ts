import { randomUUID, scryptSync } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { validateEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { createIdentityService, type IdentityService } from '../src/modules/identity/public.js';
import { createLessonAccountProvisioner } from '../src/modules/lesson-accounts/public.js';
import {
  createAccessControlService,
  type AccessControlService,
} from '../src/modules/access-control/public.js';
import {
  accessEducationAssignments,
  accessUserRoles,
} from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import {
  identityUsers,
  identityPasswordCredentials,
  identitySessions,
  identityActionTokens,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import { createAuditService } from '../src/modules/audit/public.js';
import { createOrganizationService } from '../src/modules/organization/public.js';
import { organizationInstitutions } from '../src/modules/organization/infrastructure/persistence/organization.schema.js';
import { createPeopleService, type PeopleService } from '../src/modules/people/public.js';
import {
  peopleGuardians,
  peopleStudentGuardians,
  peopleStudentInstitutions,
  peopleStudents,
  peopleTeacherInstitutions,
  peopleTeachers,
} from '../src/modules/people/infrastructure/persistence/people.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
const password = 'phase1-original-password';
const context = { actorType: 'system' as const };

suite('phase 1 identity and education access', () => {
  let database: DatabaseHandle;
  let identity: IdentityService;
  let access: AccessControlService;
  let people: PeopleService;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerId: string;
  const createdIds: string[] = [];
  let address = 0;

  async function create(
    input: { email?: string; phone?: string; mustChangePassword?: boolean } = {},
  ) {
    const user = await identity.createUser({
      ...(!input.email && !input.phone ? { email: `${randomUUID()}@example.com` } : {}),
      ...input,
      password,
    });
    createdIds.push(user.id);
    return user;
  }
  async function login(identifier: string, loginPassword = password) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: `10.0.0.${++address}`,
      payload: { identifier, password: loginPassword },
    });
    expect(response.statusCode, response.body).toBe(200);
    const cookies = response.cookies;
    const session = cookies.find((c) => c.name === 'phase1_session')!.value;
    const csrf = cookies.find((c) => c.name === 'phase1_csrf')!.value;
    return {
      response,
      headers: { cookie: `phase1_session=${session}; phase1_csrf=${csrf}`, 'x-csrf-token': csrf },
    };
  }
  async function assign(userId: string, roleKey: string) {
    const role = (await access.listRoles()).find((r) => r.key === roleKey)!;
    await database.db.insert(accessUserRoles).values({ userId, roleId: role.id });
  }

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      AUTH_COOKIE_NAME: 'phase1_session',
      AUTH_CSRF_COOKIE_NAME: 'phase1_csrf',
    });
    database = createDatabase(environment.DATABASE_URL);
    identity = createIdentityService({ database, environment });
    const audit = createAuditService({ database });
    const organization = createOrganizationService({ database, audit });
    people = createPeopleService({
      database,
      institutions: organization,
      identity,
      audit,
      lessonAccounts: createLessonAccountProvisioner({ database, audit }),
    });
    access = createAccessControlService({ database, identity, audit, educationDirectory: people });
    await access.synchronizeSystemAccess();
    const owner = await create();
    ownerId = owner.id;
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    app.get(
      '/api/phase1/unscoped',
      { config: { access: { permissions: ['education.students.read'] } } },
      async () => ({ exposed: true }),
    );
    app.get(
      '/api/phase1/:institutionId/students',
      {
        config: {
          access: {
            permissions: ['education.students.read'],
            education: { institutionParam: 'institutionId', permission: 'education.students.read' },
          },
        },
      },
      async (request) => request.educationScope,
    );
  });
  afterAll(async () => {
    if (!database) return;
    await database.db.delete(accessEducationAssignments);
    await database.db.delete(peopleStudentGuardians);
    await database.db.delete(peopleTeacherInstitutions);
    await database.db.delete(peopleStudentInstitutions);
    await database.db.delete(peopleGuardians);
    await database.db.delete(peopleTeachers);
    await database.db.delete(peopleStudents);
    await database.db.delete(organizationInstitutions);
    if (createdIds.length)
      await database.db.delete(identityUsers).where(inArray(identityUsers.id, createdIds));
    await app?.close();
  });

  it('enforces identifier and canonical phone constraints in PostgreSQL', async () => {
    const localPhone = `139${Number.parseInt(randomUUID().slice(0, 8), 16)
      .toString()
      .slice(0, 8)
      .padStart(8, '0')}`;
    const canonicalPhone = `+86${localPhone}`;
    const user = await create({ phone: localPhone });
    expect(user).toMatchObject({ email: null, phone: canonicalPhone, mustChangePassword: false });
    const session = await login(`0086 ${localPhone}`);
    expect(session.response.json().user).toMatchObject({ email: null, phone: canonicalPhone });
    await expect(
      identity.createUser({ phone: `+86 ${localPhone}`, password }),
    ).rejects.toMatchObject({ code: 'IDENTITY_PHONE_EXISTS' });
    await expect(
      database.db.insert(identityUsers).values({ email: null, phone: null }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(identityUsers).values({ email: '', phone: null }),
    ).rejects.toThrow();
    await expect(database.db.insert(identityUsers).values({ phone: localPhone })).rejects.toThrow();
    await expect(
      database.db.insert(identityUsers).values({ phone: canonicalPhone }),
    ).rejects.toThrow();
  });

  it('accepts actual legacy password hashes and upgrades them on login', async () => {
    const user = await create({ mustChangePassword: true });
    const salt = '00112233445566778899aabbccddeeff';
    const legacy = `scrypt:${salt}:${scryptSync('138000', salt, 64).toString('hex')}`;
    await database.db
      .update(identityPasswordCredentials)
      .set({ passwordHash: legacy })
      .where(eq(identityPasswordCredentials.userId, user.id));
    const authenticated = await login(user.email!, '138000');
    expect(authenticated.response.json().user.mustChangePassword).toBe(true);
    const [stored] = await database.db
      .select()
      .from(identityPasswordCredentials)
      .where(eq(identityPasswordCredentials.userId, user.id));
    expect(stored!.passwordHash).toMatch(/^scrypt:v1:/);
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: authenticated.headers,
      payload: { currentPassword: '138000', newPassword: 'legacy-upgraded-password' },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(
      (await login(user.email!, 'legacy-upgraded-password')).response.json().user
        .mustChangePassword,
    ).toBe(false);
  });

  it('enforces forced change at the server even for Owner and preserves CSRF', async () => {
    const user = await create({ mustChangePassword: true });
    await access.assignOwner(user.id);
    const session = await login(user.email!);
    for (const url of ['/api/access/permissions', '/api/access/users', '/api/auth/sessions']) {
      const denied = await app.inject({ method: 'GET', url, headers: session.headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me?fresh=1', headers: session.headers }))
        .statusCode,
    ).toBe(200);
    const missingCsrf = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: { cookie: session.headers.cookie },
      payload: { currentPassword: password, newPassword: 'changed-secure-password' },
    });
    expect(missingCsrf.json().error.code).toBe('INVALID_CSRF_TOKEN');
    const unchanged = await app.inject({
      method: 'POST',
      url: '/api/auth/password/change',
      headers: session.headers,
      payload: { currentPassword: password, newPassword: password },
    });
    expect(unchanged.json().error.code).toBe('PASSWORD_REUSE');
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/logout', headers: session.headers }))
        .statusCode,
    ).toBe(200);
  });

  it('admin reset revokes all sessions and action tokens, requires change, and audits without secrets', async () => {
    const owner = await identity.getUser(ownerId);
    const admin = await login(owner.email!);
    const target = await create();
    const first = await login(target.email!);
    await login(target.email!);
    await database.db.insert(identityActionTokens).values({
      userId: target.id,
      purpose: 'password_reset',
      tokenDigest: randomUUID().replaceAll('-', '').repeat(2),
      expiresAt: new Date(Date.now() + 60000),
    });
    const reset = await app.inject({
      method: 'POST',
      url: `/api/access/users/${target.id}/password/reset`,
      headers: admin.headers,
      payload: { newPassword: 'temporary-reset-password' },
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: first.headers })).statusCode,
    ).toBe(401);
    expect(
      await database.db
        .select()
        .from(identitySessions)
        .where(and(eq(identitySessions.userId, target.id), isNull(identitySessions.revokedAt))),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(identityActionTokens)
        .where(
          and(eq(identityActionTokens.userId, target.id), isNull(identityActionTokens.consumedAt)),
        ),
    ).toHaveLength(0);
    expect(
      (await login(target.email!, 'temporary-reset-password')).response.json().user
        .mustChangePassword,
    ).toBe(true);
    const events = await database.db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.resourceId, target.id),
          eq(auditEvents.action, 'identity.password.admin-reset'),
        ),
      );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorId: ownerId, outcome: 'success' });
    expect(JSON.stringify(events)).not.toContain('temporary-reset-password');
    const otherOwner = await create();
    await access.assignOwner(otherOwner.id);
    const protectedReset = await app.inject({
      method: 'POST',
      url: `/api/access/users/${otherOwner.id}/password/reset`,
      headers: admin.headers,
      payload: { newPassword: 'temporary-reset-password' },
    });
    expect(protectedReset.json().error.code).toBe('ACCESS_OWNER_PROTECTED');
    const unprivileged = await create();
    const unprivilegedSession = await login(unprivileged.email!);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/access/users/${target.id}/password/reset`,
          headers: unprivilegedSession.headers,
          payload: { newPassword: 'temporary-reset-password' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('keeps educational roles least privileged and enforces tenant/profile/capability boundaries', async () => {
    const teacher = await create();
    await assign(teacher.id, 'teacher');
    const organization = createOrganizationService({ database });
    const tenant = (
      await organization.create(
        {
          name: `一期范围机构-${randomUUID()}`,
          type: 'partner',
          contactName: null,
          contactPhone: null,
          address: null,
          notes: null,
        },
        context,
      )
    ).id;
    const teacherId = (
      await people.createTeacher(
        tenant,
        { fullName: '范围测试教师', identityUserId: teacher.id, phone: null },
        context,
      )
    ).id;
    const input = {
      userId: teacher.id,
      institutionId: tenant,
      permission: 'education.students.read',
    };
    await expect(access.resolveEducationScope(input)).rejects.toMatchObject({
      code: 'ACCESS_SCOPE_DENIED',
    });
    const assignments = [
      {
        role: 'teacher' as const,
        institutionId: tenant,
        teacherId,
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
    ];
    await access.replaceEducationAssignments(teacher.id, assignments, context);
    await expect(access.resolveEducationScope(input)).resolves.toEqual({
      kind: 'teacher',
      institutionId: tenant,
      teacherId,
    });
    await expect(
      access.resolveEducationScope({ ...input, institutionId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ACCESS_SCOPE_DENIED' });
    await expect(
      access.resolveEducationScope({
        ...input,
        permission: 'education.classes.manage',
        capability: 'manageClasses',
      }),
    ).rejects.toMatchObject({ code: 'ACCESS_SCOPE_DENIED' });
    assignments[0]!.teacherCapabilities.manageClasses = true;
    await access.replaceEducationAssignments(teacher.id, assignments, context);
    await expect(
      access.resolveEducationScope({
        ...input,
        permission: 'education.classes.manage',
        capability: 'manageClasses',
      }),
    ).resolves.toMatchObject({ kind: 'teacher', teacherId });
    const session = await login(teacher.email!);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/phase1/unscoped', headers: session.headers })
      ).json().error.code,
    ).toBe('ACCESS_SCOPE_REQUIRED');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/phase1/${tenant}/students`,
          headers: session.headers,
        })
      ).json(),
    ).toEqual({ kind: 'teacher', institutionId: tenant, teacherId });
    for (const key of ['institution_admin', 'teacher', 'parent']) {
      const role = (await access.listRoles()).find((r) => r.key === key)!;
      expect(
        (await access.getRole(role.id)).permissions.every((p) => p.startsWith('education.')),
      ).toBe(true);
    }
    const parent = await create();
    await assign(parent.id, 'parent');
    const student = await people.createStudent(
      tenant,
      {
        fullName: '范围测试学员',
        preferredName: null,
        grade: null,
        school: null,
        gender: 'unknown',
        birthDate: null,
        notes: null,
      },
      context,
    );
    const guardianId = (
      await people.createGuardianAndBind(
        student.id,
        { kind: 'institution', institutionId: tenant },
        {
          fullName: '范围测试家长',
          phone: null,
          email: null,
          identityUserId: parent.id,
          notes: null,
          relationship: '监护人',
          isPrimary: true,
        },
        context,
      )
    ).guardian.id;
    await access.replaceEducationAssignments(
      parent.id,
      [
        {
          ...assignments[0]!,
          role: 'parent',
          teacherId: null,
          guardianId,
          teacherCapabilities: {
            ...assignments[0]!.teacherCapabilities,
            viewAllStudents: false,
            manageClasses: false,
          },
        },
      ],
      context,
    );
    await expect(access.resolveEducationScope({ ...input, userId: parent.id })).resolves.toEqual({
      kind: 'guardian',
      institutionId: tenant,
      guardianId,
    });
    await database.db.delete(accessUserRoles).where(eq(accessUserRoles.userId, teacher.id));
    await expect(access.resolveEducationScope(input)).rejects.toMatchObject({
      code: 'ACCESS_SCOPE_DENIED',
    });
  });
});
