import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/student-360';

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

test('学员 360°聚合档案、家长、课时账本和教学交付', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const me = await page.request.get('/api/auth/me');
  const headers = { 'x-csrf-token': (await me.json()).csrfToken as string };
  const institutionsResponse = await page.request.get(
    '/api/institutions?page=1&pageSize=100&status=active',
  );
  const institution = (await institutionsResponse.json()).items[0] as { id: string };
  const suffix = Date.now().toString().slice(-8);
  const student = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/students`, {
      headers,
      data: {
        fullName: `360验收学员 ${suffix}`,
        preferredName: '小满',
        grade: '三年级',
        school: '成长小学',
      },
    }),
    201,
  );
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/students/${student.id}/guardians`,
      {
        headers,
        data: {
          fullName: `360验收家长 ${suffix}`,
          phone: `138${suffix}`,
          relationship: '母亲',
          isPrimary: true,
        },
      },
    ),
    201,
  );
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/students/${student.id}/lesson-grants`,
      {
        headers: {
          ...headers,
          'idempotency-key': randomUUID(),
          'x-expected-account-revision': '1',
        },
        data: { templateId: null, baseUnits: 8, source: 'custom', reason: '360 页面验收' },
      },
    ),
    201,
  );

  const startsAt = new Date(Date.now() - 90 * 60_000);
  const session = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/lesson-sessions`, {
      headers,
      data: {
        institutionId: institution.id,
        name: `360教学交付 ${suffix}`,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        source: 'manual',
        defaultUnits: 1,
      },
    }),
    201,
  );
  const roster = await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/lesson-sessions/${session.id}/roster`,
      {
        headers,
        data: { expectedRevision: session.revision, studentIds: [student.id] },
      },
    ),
    201,
  );
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/lesson-sessions/${session.id}/open`,
      { headers, data: { expectedRevision: roster.session.revision } },
    ),
    200,
  );
  const attended = await expectJson(
    await page.request.patch(
      `/api/institutions/${institution.id}/lesson-sessions/${session.id}/roster/${roster.roster.items[0].id}/attendance`,
      {
        headers,
        data: { expectedRevision: roster.roster.items[0].revision, attendanceStatus: 'present' },
      },
    ),
    200,
  );
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/lesson-sessions/${session.id}/roster/${roster.roster.items[0].id}/consumption`,
      {
        headers,
        data: {
          operationId: randomUUID(),
          expectedRevision: attended.revision,
          units: 1,
          consumptionSource: 'lesson_units',
          reason: '360 页面验收消课',
        },
      },
    ),
    200,
  );

  await page.goto(`/admin/students/${student.id}/360?institutionId=${institution.id}`);
  await expect(page.getByRole('heading', { name: `${student.fullName} · 360°详情` })).toBeVisible();
  await expect(page.getByText(`360验收家长 ${suffix}`)).toBeVisible();
  await expect(page.getByText('课时余额').first()).toBeVisible();
  await expect(page.getByText('7', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: /教学交付/ }).click();
  await expect(page.getByText(`360教学交付 ${suffix}`)).toBeVisible();
  await expect(page.getByText('已消课', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/delivery.png`, fullPage: true });
  await page.getByRole('tab', { name: /课时账本/ }).click();
  await expect(page.getByText('360 页面验收消课')).toBeVisible();
  await page.screenshot({ path: `${screenshots}/ledger.png`, fullPage: true });
  expect(errors).toEqual([]);
});
