import { randomUUID } from 'node:crypto';

import { inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { createAccessControlService } from '../src/modules/access-control/public.js';
import { accessUserRoles } from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import { createAuditService } from '../src/modules/audit/public.js';
import { createIdentityService, type IdentityService } from '../src/modules/identity/public.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import {
  lessonAccounts,
  lessonMovements,
} from '../src/modules/lesson-accounts/infrastructure/persistence/lesson-accounts.schema.js';
import { outboxEvents } from '../src/modules/outbox/infrastructure/persistence/outbox.schema.js';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /p3_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /p3_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `p3_session=${session}; p3_csrf=${csrf}`, csrf };
}

suite('P3 institution lesson accounts', () => {
  let database: DatabaseHandle;
  let identity: IdentityService;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ownerHeaders: ReturnType<typeof cookies>;
  const userIds: string[] = [];

  async function cleanup() {
    await database.db.execute(sql`truncate table
      lesson_movement_allocations,
      lesson_batches,
      lesson_movements,
      lesson_accounts,
      lesson_package_versions,
      lesson_package_templates,
      people_student_guardians,
      people_teacher_institutions,
      people_student_institutions,
      people_guardians,
      people_teachers,
      people_students,
      organization_institutions
      cascade`);
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

  function mutationHeaders(expectedRevision: number, key = randomUUID()) {
    return {
      cookie: ownerHeaders.cookie,
      'x-csrf-token': ownerHeaders.csrf,
      'idempotency-key': key,
      'x-expected-account-revision': String(expectedRevision),
    };
  }

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: process.env.P3_TEST_LOG_LEVEL ?? 'silent',
      AUTH_COOKIE_NAME: 'p3_session',
      AUTH_CSRF_COOKIE_NAME: 'p3_csrf',
    });
    database = createDatabase(environment.DATABASE_URL);
    identity = createIdentityService({ database, environment });
    const audit = createAuditService({ database });
    const access = createAccessControlService({ database, identity, audit });
    await cleanup();
    await access.synchronizeSystemAccess();
    const owner = await identity.createUser({
      email: `p3-owner-${randomUUID()}@example.com`,
      password: 'p3-secure-password',
    });
    userIds.push(owner.id);
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'p3-secure-password' },
    });
    expect(login.statusCode, login.body).toBe(200);
    ownerHeaders = cookies(login.headers['set-cookie']);
  });

  afterAll(async () => {
    if (!database) return;
    await cleanup();
    await app.close();
  });

  it('keeps accounts isolated, idempotent, versioned, allocated and immutable', async () => {
    const createInstitution = async (name: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/institutions',
        headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
        payload: { name: `${name}-${randomUUID()}`, type: 'partner' },
      });
      expect(response.statusCode, response.body).toBe(201);
      return response.json().id as string;
    };
    const institutionA = await createInstitution('P3-A');
    const institutionB = await createInstitution('P3-B');
    const student = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { fullName: 'P3 测试学员' },
    });
    expect(student.statusCode, student.body).toBe(201);
    const studentId = student.json().id as string;
    const link = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionB}/student-services`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { studentId },
    });
    expect(link.statusCode, link.body).toBe(201);

    const createdPackage = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/lesson-packages`,
      headers: { cookie: ownerHeaders.cookie, 'x-csrf-token': ownerHeaders.csrf },
      payload: { name: 'P3 通用 10 课时', baseUnits: 10, bonusUnits: 0 },
    });
    expect(createdPackage.statusCode, createdPackage.body).toBe(201);
    const packageId = createdPackage.json().id as string;

    const grantKey = randomUUID();
    const firstGrant = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-grants`,
      headers: mutationHeaders(1, grantKey),
      payload: {
        templateId: packageId,
        source: 'offline_purchase',
        sourceReference: 'P3-OFFLINE-001',
        reason: '线下购买通用课时',
      },
    });
    expect(firstGrant.statusCode, firstGrant.body).toBe(201);
    expect(firstGrant.json()).toMatchObject({
      account: { balanceUnits: 10, revision: 2, activeBatchCount: 1 },
      movement: { type: 'grant', units: 10 },
      affectedBatches: [{ templateRevision: 1, remainingUnits: 10 }],
    });

    const replay = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-grants`,
      headers: mutationHeaders(1, grantKey),
      payload: {
        templateId: packageId,
        source: 'offline_purchase',
        sourceReference: 'P3-OFFLINE-001',
        reason: '线下购买通用课时',
      },
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json().movement.id).toBe(firstGrant.json().movement.id);

    const duplicateSource = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-grants`,
      headers: mutationHeaders(2),
      payload: {
        templateId: packageId,
        source: 'offline_purchase',
        sourceReference: 'P3-OFFLINE-001',
        reason: '重复来源测试',
      },
    });
    expect(duplicateSource.statusCode, duplicateSource.body).toBe(409);
    expect(duplicateSource.json().error.code).toBe('LESSON_GRANT_SOURCE_EXISTS');

    const secondGrant = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-grants`,
      headers: mutationHeaders(2),
      payload: {
        templateId: null,
        baseUnits: 20,
        bonusUnits: 0,
        source: 'custom',
        sourceReference: 'P3-CUSTOM-020',
        reason: '续课登记',
      },
    });
    expect(secondGrant.statusCode, secondGrant.body).toBe(201);
    expect(secondGrant.json().account.balanceUnits).toBe(30);

    const grantB = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionB}/students/${studentId}/lesson-grants`,
      headers: mutationHeaders(1),
      payload: {
        templateId: null,
        baseUnits: 5,
        source: 'custom',
        reason: '合作机构独立发放',
      },
    });
    expect(grantB.statusCode, grantB.body).toBe(201);
    expect(grantB.json().account.balanceUnits).toBe(5);

    const concurrent = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/institutions/${institutionA}/students/${studentId}/lesson-grants`,
        headers: mutationHeaders(3),
        payload: {
          templateId: null,
          baseUnits: 1,
          source: 'custom',
          sourceReference: `P3-CONCURRENT-${randomUUID()}`,
          reason: '并发请求一',
        },
      }),
      app.inject({
        method: 'POST',
        url: `/api/institutions/${institutionA}/students/${studentId}/lesson-grants`,
        headers: mutationHeaders(3),
        payload: {
          templateId: null,
          baseUnits: 1,
          source: 'custom',
          sourceReference: `P3-CONCURRENT-${randomUUID()}`,
          reason: '并发请求二',
        },
      }),
    ]);
    expect(concurrent.map((item) => item.statusCode).sort()).toEqual([201, 409]);
    const winner = concurrent.find((item) => item.statusCode === 201)!;

    const debit = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-adjustments`,
      headers: mutationHeaders(4),
      payload: { direction: 'debit', units: 15, reason: '跨批次调整扣减' },
    });
    expect(debit.statusCode, debit.body).toBe(200);
    expect(debit.json()).toMatchObject({
      account: { balanceUnits: 16, revision: 5 },
      movement: { type: 'adjustment_debit', units: 15 },
    });
    expect(debit.json().movement.allocations).toHaveLength(2);

    const winnerBatchId = winner.json().affectedBatches[0].id as string;
    const reversed = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-batches/${winnerBatchId}/reversal`,
      headers: mutationHeaders(5),
      payload: { reason: '并发测试发放纠错' },
    });
    expect(reversed.statusCode, reversed.body).toBe(200);
    expect(reversed.json()).toMatchObject({
      account: { balanceUnits: 15, revision: 6 },
      movement: { type: 'grant_reversal', units: 1 },
      affectedBatches: [{ status: 'reversed' }],
    });

    const secondBatchId = secondGrant.json().affectedBatches[0].id as string;
    const clawedBack = await app.inject({
      method: 'POST',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-batches/${secondBatchId}/clawbacks`,
      headers: mutationHeaders(6),
      payload: { units: 3, reason: '线下退款后扣回剩余权益' },
    });
    expect(clawedBack.statusCode, clawedBack.body).toBe(200);
    expect(clawedBack.json().account).toMatchObject({ balanceUnits: 12, revision: 7 });

    const accountA = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionA}/students/${studentId}/lesson-account`,
      headers: { cookie: ownerHeaders.cookie },
    });
    const accountB = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionB}/students/${studentId}/lesson-account`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(accountA.json().balanceUnits).toBe(12);
    expect(accountB.json().balanceUnits).toBe(5);

    const [storedAccount] = await database.db
      .select()
      .from(lessonAccounts)
      .where(sql`${lessonAccounts.id} = ${accountA.json().id}`);
    const [ledger] = await database.db
      .select({
        credit: sql<number>`sum(case when direction = 'credit' then units else 0 end)::integer`,
        debit: sql<number>`sum(case when direction = 'debit' then units else 0 end)::integer`,
      })
      .from(lessonMovements)
      .where(sql`${lessonMovements.accountId} = ${storedAccount!.id}`);
    expect(ledger!.credit - ledger!.debit).toBe(storedAccount!.balanceUnits);

    const accountEvents = await database.db
      .select({
        aggregateVersion: outboxEvents.aggregateVersion,
        payload: outboxEvents.payload,
      })
      .from(outboxEvents)
      .where(
        sql`${outboxEvents.topic} = 'education.lesson-account.changed'
          and ${outboxEvents.aggregateId} = ${storedAccount!.id}`,
      );
    expect(accountEvents).toHaveLength(6);
    expect(accountEvents.map((event) => event.aggregateVersion).sort((a, b) => a! - b!)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(accountEvents[0]!.payload).toMatchObject({ accountId: storedAccount!.id });

    await expect(
      database.db
        .update(lessonMovements)
        .set({ reason: '试图覆盖历史' })
        .where(sql`${lessonMovements.id} = ${firstGrant.json().movement.id}`),
    ).rejects.toThrow();

    const crossInstitution = await app.inject({
      method: 'GET',
      url: `/api/institutions/${institutionB}/students/${studentId}/lesson-account/batches?sourceType=offline_purchase`,
      headers: { cookie: ownerHeaders.cookie },
    });
    expect(crossInstitution.statusCode, crossInstitution.body).toBe(200);
    expect(crossInstitution.json().items).toEqual([]);
  });
});
