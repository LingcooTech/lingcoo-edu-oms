import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/phase-three';

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

async function post(request: APIRequestContext, path: string, csrf: string, data: unknown) {
  const response = await request.post(path, { headers: { 'x-csrf-token': csrf }, data });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function mutateLessons(
  request: APIRequestContext,
  path: string,
  csrf: string,
  expectedRevision: number,
  data: unknown,
  expectedStatus = 201,
) {
  const response = await request.post(path, {
    headers: {
      'x-csrf-token': csrf,
      'idempotency-key': randomUUID(),
      'x-expected-account-revision': String(expectedRevision),
    },
    data,
  });
  expect(response.status(), await response.text()).toBe(expectedStatus);
  return response.json();
}

async function chooseSelect(page: Page, index: number, label: string) {
  const select = page.locator('.ant-select').nth(index);
  await select.click();
  await select.locator('input').fill(label);
  await page.locator('.ant-select-item-option').filter({ hasText: label }).last().click();
}

function balanceStatistic(page: Page) {
  return page.locator('.ant-statistic').filter({ hasText: '当前可用课时' });
}

test('真实 Web：机构通用课时包、独立账户、发放、调整与流水', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  const sessionResponse = await page.request.get('/api/auth/me');
  expect(sessionResponse.status()).toBe(200);
  const csrf = (await sessionResponse.json()).csrfToken as string;
  const suffix = Date.now().toString().slice(-6);
  const institutionA = await post(page.request, '/api/institutions', csrf, {
    name: `P3 自营成长空间 ${suffix}`,
    type: 'self_operated',
  });
  const institutionB = await post(page.request, '/api/institutions', csrf, {
    name: `P3 合作书法机构 ${suffix}`,
    type: 'partner',
  });
  const student = await post(page.request, `/api/institutions/${institutionA.id}/students`, csrf, {
    fullName: `P3 学员 ${suffix}`,
    grade: '四年级',
  });
  await post(page.request, `/api/institutions/${institutionB.id}/student-services`, csrf, {
    studentId: student.id,
  });

  await page.goto('/admin/lesson-packages');
  await expect(page.getByRole('heading', { name: '课时包' })).toBeVisible();
  await chooseSelect(page, 0, institutionA.name);
  await page.getByRole('button', { name: '新建课时包' }).click();
  const packageDialog = page.getByRole('dialog', { name: '新建课时包' });
  await packageDialog.getByLabel('课时包名称').fill(`通用 10 课时 ${suffix}`);
  await packageDialog.getByLabel('基础课时').fill('10');
  await packageDialog.getByLabel('赠送课时').fill('0');
  await packageDialog.getByLabel('说明').fill('不绑定课程、班级、教师或校区。');
  await page.screenshot({ path: `${screenshots}/01-package-modal.png`, fullPage: true });
  const [packageResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/lesson-packages') && response.request().method() === 'POST',
    ),
    packageDialog.getByRole('button', { name: /确\s*定/ }).click(),
  ]);
  expect(packageResponse.status(), await packageResponse.text()).toBe(201);
  await expect(page.getByText(`通用 10 课时 ${suffix}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-packages.png`, fullPage: true });

  await page.goto('/admin/lesson-accounts');
  await expect(page.getByRole('heading', { name: '课时账户' })).toBeVisible();
  await chooseSelect(page, 0, institutionA.name);
  await chooseSelect(page, 1, student.fullName);
  await expect(balanceStatistic(page).getByText('0', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '发放课时' }).click();
  const firstGrant = page.getByRole('dialog', { name: '发放课时' });
  await firstGrant
    .locator('.ant-form-item')
    .filter({ hasText: '课时包' })
    .locator('.ant-select')
    .click();
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: `通用 10 课时 ${suffix}` })
    .click();
  await firstGrant.getByLabel('来源编号').fill(`OFFLINE-${suffix}-10`);
  await firstGrant.getByLabel('发放原因').fill('线下购买通用课时');
  await page.screenshot({ path: `${screenshots}/03-grant-modal.png`, fullPage: true });
  const [firstGrantResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/lesson-grants') && response.request().method() === 'POST',
    ),
    firstGrant.getByRole('button', { name: /确\s*定/ }).click(),
  ]);
  expect(firstGrantResponse.status(), await firstGrantResponse.text()).toBe(201);
  await expect(balanceStatistic(page).getByText('10', { exact: true })).toBeVisible();

  const lessonPath = `/api/institutions/${institutionA.id}/students/${student.id}`;
  const currentAccountResponse = await page.request.get(`${lessonPath}/lesson-account`);
  expect(currentAccountResponse.status()).toBe(200);
  const currentAccount = await currentAccountResponse.json();
  await mutateLessons(page.request, `${lessonPath}/lesson-grants`, csrf, currentAccount.revision, {
    templateId: null,
    baseUnits: 20,
    bonusUnits: 0,
    source: 'custom',
    sourceReference: `CUSTOM-${suffix}-20`,
    reason: '续课登记，不覆盖原批次',
  });
  await page.getByRole('button', { name: '刷新' }).click();
  await expect(balanceStatistic(page).getByText('30', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '课时调整' }).click();
  const adjustment = page.getByRole('dialog', { name: '课时调整' });
  await expect(adjustment).toBeVisible();
  await adjustment.getByRole('button', { name: /取\s*消/ }).click();
  const beforeDebitResponse = await page.request.get(`${lessonPath}/lesson-account`);
  const beforeDebit = await beforeDebitResponse.json();
  await mutateLessons(
    page.request,
    `${lessonPath}/lesson-adjustments`,
    csrf,
    beforeDebit.revision,
    { direction: 'debit', units: 5, reason: '运营核对后有依据扣减' },
    200,
  );
  await page.getByRole('button', { name: '刷新' }).click();
  await expect(balanceStatistic(page).getByText('25', { exact: true })).toBeVisible();
  await expect(page.getByText(`通用 10 课时 ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`CUSTOM-${suffix}-20`, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/04-account-batches.png`, fullPage: true });

  await page.getByRole('tab', { name: '课时流水' }).click();
  await expect(page.getByText('调整扣减', { exact: true })).toBeVisible();
  await expect(page.getByText('30 → 25', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/05-account-ledger.png`, fullPage: true });

  await chooseSelect(page, 0, institutionB.name);
  await chooseSelect(page, 1, student.fullName);
  await expect(balanceStatistic(page).getByText('0', { exact: true })).toBeVisible();
  const partnerPath = `/api/institutions/${institutionB.id}/students/${student.id}`;
  await mutateLessons(page.request, `${partnerPath}/lesson-grants`, csrf, 1, {
    templateId: null,
    baseUnits: 5,
    bonusUnits: 0,
    source: 'custom',
    sourceReference: `PARTNER-${suffix}-5`,
    reason: '合作机构独立发放',
  });
  await page.getByRole('button', { name: '刷新' }).click();
  await expect(balanceStatistic(page).getByText('5', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/06-partner-account.png`, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/lesson-accounts');
  await expect(page.getByRole('heading', { name: '课时账户' })).toBeVisible();
  await chooseSelect(page, 0, institutionB.name);
  await chooseSelect(page, 1, student.fullName);
  await expect(balanceStatistic(page).getByText('5', { exact: true })).toBeVisible();
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: '课时账户' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${screenshots}/07-mobile-account.png`, fullPage: true });
  expect(errors).toEqual([]);
});
