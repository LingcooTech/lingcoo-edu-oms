import { expect, test, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/organization-navigation';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱或手机号').fill(process.env.BOOTSTRAP_OWNER_EMAIL!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.BOOTSTRAP_OWNER_PASSWORD!);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByRole('heading', { name: '教育运营工作台' })).toBeVisible();
}

async function saveOrganizationMode(
  page: Page,
  label: RegExp,
  expected: 'self_operated_only' | 'mixed',
) {
  await page.getByRole('button', { name: '编辑组织资料' }).click();
  const editor = page.getByRole('dialog', { name: '编辑组织资料' });
  await expect(editor).toBeVisible();
  await page.waitForTimeout(350);
  await editor.getByLabel(label).check();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === '/api/organization',
  );
  await editor.getByRole('button', { name: /保\s*存/ }).click();
  const confirmation = page.getByRole('dialog', { name: '切换为纯组织自营？' });
  if (await confirmation.isVisible({ timeout: 800 }).catch(() => false)) {
    await confirmation.getByRole('button', { name: '确认切换' }).click();
  }
  const response = await responsePromise;
  expect(response.status(), await response.text()).toBe(200);
  expect((await response.json()).operationMode).toBe(expected);
  await expect(editor).toBeHidden();
}

test('旧系统风格菜单与纯自营机构模式', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  await expect(page.locator('.admin-navigation .ant-menu-submenu-title')).toHaveText([
    '业务概览',
    '组织与机构',
    '教学资源',
    '教务管理',
    '运营管理',
    '系统设置',
  ]);
  const organizationSection = page
    .locator('.admin-navigation .ant-menu-submenu')
    .filter({ has: page.getByText('组织与机构', { exact: true }) });
  await organizationSection.locator('.ant-menu-submenu-title').click();
  await expect(organizationSection).toHaveClass(/ant-menu-submenu-open/);
  await expect(organizationSection.getByText('组织设置', { exact: true })).toBeVisible();
  await expect(organizationSection.getByText('机构管理', { exact: true })).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${screenshots}/01-sidebar-order-and-style.png`, fullPage: true });

  await page.goto('/admin/organization');
  await expect(page.getByRole('heading', { name: '组织设置' })).toBeVisible();
  await saveOrganizationMode(page, /^纯组织自营/, 'self_operated_only');
  await expect(page.getByText('纯组织自营', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/02-organization-self-operated.png`,
    fullPage: true,
  });

  const me = await page.request.get('/api/auth/me');
  const csrf = (await me.json()).csrfToken as string;
  const attemptedPartner = await page.request.post('/api/institutions', {
    headers: { 'x-csrf-token': csrf },
    data: { name: `纯自营验收机构-${Date.now()}`, type: 'partner' },
  });
  expect(attemptedPartner.status(), await attemptedPartner.text()).toBe(201);
  expect((await attemptedPartner.json()).type).toBe('self_operated');

  await page.goto('/admin/institutions');
  await expect(page.getByText('当前为纯组织自营模式')).toBeVisible();
  await expect(page.getByPlaceholder('机构类型')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: '类型' })).toHaveCount(0);
  await page.getByRole('button', { name: '新建机构' }).click();
  const institutionEditor = page.getByRole('dialog', { name: '新建机构' });
  await expect(institutionEditor.getByLabel('机构类型')).toHaveCount(0);
  await page.screenshot({
    path: `${screenshots}/03-institution-modal-without-type.png`,
    fullPage: true,
  });
  await institutionEditor.getByRole('button', { name: /取\s*消/ }).click();

  await page.goto('/admin/organization');
  await saveOrganizationMode(page, /^自营 \+ 合作机构/, 'mixed');
  await page.reload();
  await expect(page.getByText('自营 + 合作机构', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
