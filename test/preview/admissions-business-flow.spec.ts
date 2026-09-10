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

async function jsonResponse(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  path: string,
  csrf: string,
  data?: unknown,
) {
  const response =
    method === 'GET'
      ? await request.get(path)
      : await request.post(path, { headers: { 'x-csrf-token': csrf }, data });
  expect(response.status(), await response.text()).toBeGreaterThanOrEqual(200);
  expect(response.status(), await response.text()).toBeLessThan(300);
  return response.json();
}

test('招生转化闭环：试听签到不扣课时，转化后建立零余额账户', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  const session = await jsonResponse(page.request, 'GET', '/api/auth/me', 'unused');
  const csrf = session.csrfToken as string;
  const institutions = await jsonResponse(
    page.request,
    'GET',
    '/api/institutions?page=1&pageSize=100&status=active',
    csrf,
  );
  const institution = institutions.items[0] as { id: string; name: string } | undefined;
  expect(institution).toBeTruthy();

  // 场次是验收夹具，之后的预约、签到、转化全部从后台页面完成。
  const suffix = Date.now();
  const trialTitle = `闭环试听验收 ${suffix}`;
  await jsonResponse(page.request, 'POST', '/api/admissions/trials', csrf, {
    institutionId: institution!.id,
    title: trialTitle,
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    capacity: 1,
    notes: '用于核验试听不扣课时及转化建档规则。',
  });

  await page.goto('/admin/admissions/leads');
  await expect(page.getByRole('heading', { name: '招生转化', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增线索' }).click();
  const leadDialog = page.getByRole('dialog', { name: '新增线索' });
  const studentName = `闭环学员${suffix}`;
  await leadDialog.getByLabel('学员姓名').fill(studentName);
  await leadDialog.getByLabel('家长姓名').fill('闭环家长');
  await leadDialog.getByLabel('联系电话').fill(`139${String(suffix).slice(-8)}`);
  const leadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/admissions/leads',
  );
  await leadDialog.getByRole('button', { name: '保存线索' }).click();
  expect((await leadResponse).status()).toBe(201);
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  const leadRow = page.locator('.ant-table-row').filter({ hasText: studentName });
  await leadRow.getByRole('button', { name: '处理' }).click();
  const detail = page.getByRole('dialog', { name: `处理线索：${studentName}` });

  await detail.locator('.ant-select').filter({ hasText: '选择可预约试听' }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: trialTitle }).click();
  const bookingResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/trial-bookings'),
  );
  await detail.getByRole('button', { name: '预约试听' }).click();
  expect((await bookingResponse).status()).toBe(200);
  await expect(detail.getByText('试听与转化')).toBeVisible();
  await detail.getByRole('button', { name: /关\s*闭|取\s*消/ }).click();

  await page.goto('/admin/admissions/trials');
  const trialRow = page.locator('.ant-table-row').filter({ hasText: trialTitle });
  await expect(trialRow).toBeVisible();
  await trialRow.getByRole('button', { name: '报名名单' }).click();
  const registrations = page.getByRole('dialog', { name: `${trialTitle} · 报名名单` });
  await expect(registrations.getByText('已预约', { exact: true })).toBeVisible();
  const checkInResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/check-in'),
  );
  await registrations.getByRole('button', { name: '签到' }).click();
  expect((await checkInResponse).status()).toBe(200);
  await expect(registrations.getByText('已签到', { exact: true })).toBeVisible();
  await registrations.getByRole('button', { name: /关\s*闭|取\s*消/ }).click();

  await page.goto('/admin/admissions/leads');
  await page
    .locator('.ant-table-row')
    .filter({ hasText: studentName })
    .getByRole('button', { name: '处理' })
    .click();
  const conversionDetail = page.getByRole('dialog', { name: `处理线索：${studentName}` });
  await conversionDetail.locator('.ant-select').filter({ hasText: '转化到所属机构' }).click();
  await page.locator('.ant-select-item-option').filter({ hasText: institution!.name }).click();
  const conversionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/convert'),
  );
  await conversionDetail.getByRole('button', { name: '转为学员档案' }).click();
  const converted = await conversionResponse;
  expect(converted.status()).toBe(200);
  const conversionBody = await converted.json();
  expect(conversionBody.student.fullName).toBe(studentName);
  expect(conversionBody.guardian.guardian.fullName).toBe('闭环家长');
  await expect(page.getByText('已转为学员档案')).toHaveCount(0);

  const lead = await jsonResponse(
    page.request,
    'GET',
    `/api/admissions/leads?search=${encodeURIComponent(studentName)}&page=1&pageSize=20`,
    csrf,
  );
  expect(lead.items).toHaveLength(1);
  expect(lead.items[0].status).toBe('won');
  expect(lead.items[0].convertedStudentId).toBe(conversionBody.student.id);

  const student = await jsonResponse(
    page.request,
    'GET',
    `/api/institutions/${institution!.id}/students/${conversionBody.student.id}`,
    csrf,
  );
  expect(student.fullName).toBe(studentName);
  const guardians = await jsonResponse(
    page.request,
    'GET',
    `/api/institutions/${institution!.id}/students/${conversionBody.student.id}/guardians`,
    csrf,
  );
  expect(guardians.items).toHaveLength(1);
  expect(guardians.items[0].guardian.fullName).toBe('闭环家长');

  const accountPath = `/api/institutions/${institution!.id}/students/${conversionBody.student.id}`;
  const account = await jsonResponse(page.request, 'GET', `${accountPath}/lesson-account`, csrf);
  expect(account.balanceUnits).toBe(0);
  expect(account.lifetimeCreditedUnits).toBe(0);
  expect(account.lifetimeDebitedUnits).toBe(0);
  const movements = await jsonResponse(
    page.request,
    'GET',
    `${accountPath}/lesson-account/movements?page=1&pageSize=20`,
    csrf,
  );
  expect(movements.items).toEqual([]);

  await page.screenshot({
    path: 'docs/acceptance/admissions/04-business-flow.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
