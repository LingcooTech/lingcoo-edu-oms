import { expect, test } from '@playwright/test';

test('管理员查看课次教师分配入口和已分配教师', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/admin/login');
  await page.getByLabel('邮箱或手机号').fill(process.env.BOOTSTRAP_OWNER_EMAIL!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.BOOTSTRAP_OWNER_PASSWORD!);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).not.toHaveURL(/login/);

  await page.goto('/admin/lesson-sessions');
  await expect(page.getByRole('heading', { name: '课次管理', exact: true })).toBeVisible();
  await page.locator('.session-filter-card .ant-select').first().click();
  await page.locator('.ant-select-item-option').filter({ hasText: '教师工作台演示机构' }).click();

  const sessionRow = page
    .locator('.session-list-row')
    .filter({ hasText: '教师点名演示课' })
    .first();
  await expect(sessionRow).toBeVisible();
  await sessionRow.click();
  await expect(page.getByText('演示点名教师 · 授课', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/phase-five/01-admin-teacher-assignment.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: '管理教师' }).click();
  const dialog = page.getByRole('dialog', { name: /管理课次教师/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('教师分配只记录课次参与角色')).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/phase-five/02-admin-teacher-modal.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
