import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('课次创建、点名、消课与原路撤销', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin/login');
  await page.getByLabel('邮箱或手机号').fill(process.env.BOOTSTRAP_OWNER_EMAIL!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.BOOTSTRAP_OWNER_PASSWORD!);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).not.toHaveURL(/login/);
  const me = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'x-csrf-token': me.csrfToken };
  const suffix = Date.now();
  const institutionResponse = await page.request.post('/api/institutions', {
    headers,
    data: { name: `P4试用机构${suffix}`, type: 'self_operated' },
  });
  expect(institutionResponse.status()).toBe(201);
  const institution = await institutionResponse.json();
  const studentResponse = await page.request.post(`/api/institutions/${institution.id}/students`, {
    headers,
    data: { fullName: `试用学员${suffix}` },
  });
  expect(studentResponse.status()).toBe(201);
  const student = await studentResponse.json();
  const grant = await page.request.post(
    `/api/institutions/${institution.id}/students/${student.id}/lesson-grants`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID(), 'x-expected-account-revision': '1' },
      data: { templateId: null, baseUnits: 3, source: 'custom', reason: '浏览器验收课时' },
    },
  );
  expect(grant.status()).toBe(201);
  await page.goto('/admin/lesson-sessions');
  await expect(page.getByRole('heading', { name: '课次管理', exact: true })).toBeVisible();
  await page.locator('.session-filter-card .ant-select').first().click();
  await page.getByText(institution.name, { exact: false }).last().click();
  await page.getByRole('button', { name: '新建课次' }).click();
  const dialog = page.getByRole('dialog', { name: '新建课次' });
  await dialog.getByLabel('课次名称').fill(`成长空间试用课次${suffix}`);
  await page.screenshot({ path: 'docs/acceptance/phase-four/01-create-modal.png', fullPage: true });
  await dialog.getByRole('button', { name: '创建课次' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /添加学员$/ }).click();
  const rosterDialog = page.getByRole('dialog', { name: '添加课次学员' });
  await rosterDialog.locator('.ant-select').click();
  await page.locator('.ant-select-item-option').filter({ hasText: student.fullName }).click();
  await rosterDialog.getByRole('button', { name: '添加到名单' }).click();
  await expect(rosterDialog).not.toBeVisible();
  await page.getByRole('button', { name: /打开课次$/ }).click();
  await page.getByRole('button', { name: '确认打开' }).click();
  const row = page.getByRole('row').filter({ hasText: student.fullName });
  await row.locator('.ant-select').click();
  await page.locator('.ant-select-item-option').filter({ hasText: '到课' }).click();
  await expect(row.getByRole('button', { name: /消课$/ })).toBeEnabled();
  await row.getByRole('button', { name: /消课$/ }).click();
  await page.getByRole('button', { name: '确认消课' }).click();
  await expect(row.getByText('已消课', { exact: true })).toBeVisible();
  const accountPath = `/api/institutions/${institution.id}/students/${student.id}/lesson-account`;
  expect((await (await page.request.get(accountPath)).json()).balanceUnits).toBe(2);
  await page.screenshot({ path: 'docs/acceptance/phase-four/02-consumed.png', fullPage: true });
  await row.getByRole('button', { name: /撤销$/ }).click();
  await page.getByLabel('撤销原因').fill('试用纠错，原路退回');
  await page.getByRole('button', { name: '确认撤销' }).click();
  await expect(row.getByText('已撤销', { exact: true })).toBeVisible();
  expect((await (await page.request.get(accountPath)).json()).balanceUnits).toBe(3);
  await page.screenshot({ path: 'docs/acceptance/phase-four/03-reversed.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/acceptance/phase-four/04-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
