import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱或手机号').fill(process.env.BOOTSTRAP_OWNER_EMAIL!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.BOOTSTRAP_OWNER_PASSWORD!);
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().endsWith('/api/auth/login')),
    page.getByRole('button', { name: /登\s*录/ }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(200);
}

async function expectJson(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  status: number,
) {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test('周期卡：首次使用激活、限次投影、冲正和后台页面', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await login(page);

  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  const csrf = (await me.json()).csrfToken as string;
  const headers = { 'x-csrf-token': csrf };
  const institutionsResponse = await page.request.get(
    '/api/institutions?page=1&pageSize=100&status=active',
  );
  expect(institutionsResponse.status(), await institutionsResponse.text()).toBe(200);
  const institution = (await institutionsResponse.json()).items[0] as { id: string } | undefined;
  expect(institution).toBeTruthy();
  const studentsResponse = await page.request.get(
    `/api/institutions/${institution!.id}/students?page=1&pageSize=100&status=active`,
  );
  expect(studentsResponse.status(), await studentsResponse.text()).toBe(200);
  const student = (await studentsResponse.json()).items[0] as
    { id: string; fullName: string } | undefined;
  expect(student).toBeTruthy();

  const suffix = Date.now().toString().slice(-8);
  const product = await expectJson(
    await page.request.post(`/api/institutions/${institution!.id}/period-card-products`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: {
        name: `周期卡验收 ${suffix}`,
        description: '不绑定课程和教学资源的限次周期权益',
        mode: 'limited',
        usageLimit: 2,
        durationUnit: 'month',
        durationCount: 1,
        activationPolicy: 'on_first_use',
        priceAmount: 9900,
        currency: 'CNY',
        onlineSaleEnabled: false,
      },
    }),
    201,
  );
  const entitlement = await expectJson(
    await page.request.post(`/api/institutions/${institution!.id}/period-card-entitlements`, {
      headers,
      data: {
        operationId: randomUUID(),
        studentId: student!.id,
        productId: product.id,
      },
    }),
    201,
  );
  expect(entitlement).toMatchObject({
    effectiveStatus: 'pending_activation',
    activationStartsAt: null,
    endsAt: null,
    usedQuantity: 0,
    remainingQuantity: 2,
  });

  const sourceReference = `preview-session:${suffix}:student:${student!.id}`;
  const used = await expectJson(
    await page.request.post(`/api/institutions/${institution!.id}/period-card-usages`, {
      headers,
      data: {
        operationId: randomUUID(),
        entitlementId: entitlement.id,
        quantity: 1,
        sourceReference,
        occurredAt: new Date().toISOString(),
        reason: '周期卡预览验收',
      },
    }),
    201,
  );
  expect(used.entitlement).toMatchObject({
    effectiveStatus: 'active',
    usedQuantity: 1,
    remainingQuantity: 1,
  });
  expect(used.entitlement.activationStartsAt).toBeTruthy();
  expect(used.usage).toMatchObject({ status: 'active', quantity: 1, sourceReference });

  const duplicate = await page.request.post(
    `/api/institutions/${institution!.id}/period-card-usages`,
    {
      headers,
      data: {
        operationId: randomUUID(),
        entitlementId: entitlement.id,
        quantity: 1,
        sourceReference,
        occurredAt: new Date().toISOString(),
      },
    },
  );
  expect(duplicate.status(), await duplicate.text()).toBe(409);

  const reversed = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/period-card-usages/${used.usage.id}/reverse`,
      {
        headers,
        data: { operationId: randomUUID(), reason: '验收冲正' },
      },
    ),
    200,
  );
  expect(reversed.entitlement).toMatchObject({ usedQuantity: 0, remainingQuantity: 2 });
  expect(reversed.usage).toMatchObject({ status: 'reversed', reversalReason: '验收冲正' });

  const sessionStartsAt = new Date(Date.now() + 60_000);
  const sessionEndsAt = new Date(sessionStartsAt.getTime() + 60 * 60_000);
  const session = await expectJson(
    await page.request.post(`/api/institutions/${institution!.id}/lesson-sessions`, {
      headers,
      data: {
        institutionId: institution!.id,
        name: `周期卡课次验收 ${suffix}`,
        startsAt: sessionStartsAt.toISOString(),
        endsAt: sessionEndsAt.toISOString(),
        source: 'manual',
        defaultUnits: 1,
      },
    }),
    201,
  );
  const rosterResult = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${session.id}/roster`,
      {
        headers,
        data: { expectedRevision: session.revision, studentIds: [student!.id] },
      },
    ),
    201,
  );
  const opened = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${session.id}/open`,
      {
        headers,
        data: { expectedRevision: rosterResult.session.revision },
      },
    ),
    200,
  );
  expect(opened.status).toBe('open');
  const rosterEntry = rosterResult.roster.items[0];
  const attended = await expectJson(
    await page.request.patch(
      `/api/institutions/${institution!.id}/lesson-sessions/${session.id}/roster/${rosterEntry.id}/attendance`,
      {
        headers,
        data: { expectedRevision: rosterEntry.revision, attendanceStatus: 'present' },
      },
    ),
    200,
  );
  const consumed = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${session.id}/roster/${rosterEntry.id}/consumption`,
      {
        headers,
        data: {
          operationId: randomUUID(),
          expectedRevision: attended.revision,
          units: 1,
          consumptionSource: 'period_card',
          periodCardEntitlementId: entitlement.id,
          reason: '课次周期卡消课验收',
        },
      },
    ),
    200,
  );
  expect(consumed.rosterEntry).toMatchObject({
    consumptionStatus: 'consumed',
    consumptionSource: 'period_card',
    periodCardEntitlementId: entitlement.id,
    movementId: null,
  });
  expect(consumed.periodCardUsageId).toBeTruthy();
  const sessionReversal = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${session.id}/roster/${rosterEntry.id}/consumption/reversal`,
      {
        headers,
        data: {
          operationId: randomUUID(),
          expectedRevision: consumed.rosterEntry.revision,
          reason: '课次周期卡消课冲正验收',
        },
      },
    ),
    200,
  );
  expect(sessionReversal.rosterEntry).toMatchObject({
    consumptionStatus: 'reversed',
    consumptionSource: 'period_card',
    reversalMovementId: null,
  });

  await page.goto('/admin/period-cards');
  await expect(page.getByRole('heading', { name: '周期卡' })).toBeVisible();
  await expect(page.getByText('周期卡不绑定课程、校区、教师或班级')).toBeVisible();
  await expect(page.getByText(product.name)).toBeVisible();
  await page.getByRole('tab', { name: '学员权益' }).click();
  await expect(page.getByText(student!.fullName).first()).toBeVisible();
  await expect(page.getByText('有效').first()).toBeVisible();
  await page.getByRole('tab', { name: '使用记录' }).click();
  await expect(page.getByText(sourceReference)).toBeVisible();
  await expect(page.getByText('已冲正').first()).toBeVisible();
  await page.screenshot({ path: 'docs/acceptance/period-cards/period-cards.png', fullPage: true });
  expect(pageErrors).toEqual([]);
});
