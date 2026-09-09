import { expect, test, type Page } from '@playwright/test';

const initialPassword = 'Preview-Temporary-2026!';
const changedPassword = 'Preview-Changed-2026!';
const resetPassword = 'Preview-Reset-2026!';
const screenshots = 'docs/acceptance/phase-one';

async function login(page: Page, identifier: string, password: string) {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱或手机号').fill(identifier);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith('/api/auth/login') && candidate.request().method() === 'POST',
    ),
    page.getByRole('button', { name: /登\s*录/ }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(200);
}

test('真实数据库：账号创建、手机号登录、强制改密、权限隔离、重置撤销会话及停用', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const phone = `139${Date.now().toString().slice(-8)}`;
  const name = `一期验收教师 ${phone.slice(-4)}`;
  await page.goto('/admin/login');
  await expect(page.getByLabel('邮箱或手机号')).toBeVisible();
  await page.screenshot({ path: `${screenshots}/01-login.png`, fullPage: true });
  await login(page, process.env.BOOTSTRAP_OWNER_EMAIL!, process.env.BOOTSTRAP_OWNER_PASSWORD!);
  await expect(page.getByRole('heading', { name: '教育运营工作台' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-dashboard.png`, fullPage: true });
  const sessionResponse = await page.request.get('/api/auth/me');
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();
  const headers = { 'x-csrf-token': session.csrfToken as string };
  const rolesResponse = await page.request.get('/api/access/roles');
  expect(rolesResponse.status()).toBe(200);
  const roles = (await rolesResponse.json()).items as { id: string; key: string; name: string }[];
  const teacher = roles.find((role) => role.key === 'teacher');
  expect(teacher).toBeTruthy();

  await page.goto('/admin/access/users');
  await page.getByRole('button', { name: '新建账号' }).click();
  await expect(page.getByText('首次登录强制修改密码')).toBeVisible();
  await page.screenshot({ path: `${screenshots}/03-create-account.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByText('首次登录强制修改密码')).toBeHidden();
  const createResponse = await page.request.post('/api/access/users', {
    headers,
    data: {
      phone,
      password: initialPassword,
      displayName: name,
      mustChangePassword: true,
      emailVerified: false,
      roleIds: [teacher!.id],
    },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  const listResponse = await page.request.get(`/api/access/users?search=${phone}`);
  const [account] = (await listResponse.json()).items;
  expect(account.email).toBeNull();
  expect(account.phone).toBe(`+86${phone}`);
  expect(account.mustChangePassword).toBe(true);
  const missingCsrf = await page.request.patch(`/api/access/users/${account.id}`, {
    data: { displayName: '不应写入' },
  });
  expect(missingCsrf.status()).toBe(403);

  const memberContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:15173',
    viewport: { width: 1440, height: 1000 },
  });
  const member = await memberContext.newPage();
  member.on('pageerror', (error) => errors.push(error.message));
  await login(member, phone, initialPassword);
  await expect(member).toHaveURL(/\/account\/security$/);
  await expect(member.getByText('首次登录后请立即修改密码')).toBeVisible();
  await member.screenshot({ path: `${screenshots}/04-forced-password.png`, fullPage: true });
  const guarded = await member.request.get('/api/access/users');
  expect(guarded.status()).toBe(403);
  expect((await guarded.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  await member.getByLabel('当前密码').fill(initialPassword);
  await member.getByLabel('新密码', { exact: true }).fill(changedPassword);
  await member.getByRole('button', { name: /修改密码/ }).click();
  await expect(member).toHaveURL(/\/login$/);
  await login(member, `+86${phone}`, changedPassword);
  await member.goto('/admin/');
  await expect(member.getByRole('heading', { name: '教育运营工作台' })).toBeVisible();
  const denied = await member.request.get('/api/access/users');
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe('ACCESS_PERMISSION_DENIED');
  await expect(member.getByRole('menuitem', { name: /账号管理/ })).toHaveCount(0);

  await page
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('button', { name: /编辑/ })
    .click();
  await page.getByRole('button', { name: /重置密码/ }).click();
  await page.getByLabel('新临时密码').fill(resetPassword);
  await page.getByRole('button', { name: /重置并要求修改/ }).click();
  await expect(page.getByText('密码已重置，账号下次登录需要修改密码')).toBeVisible();
  expect((await member.request.get('/api/auth/me')).status()).toBe(401);
  await member.reload();
  await login(member, phone, resetPassword);
  await expect(member).toHaveURL(/\/account\/security$/);
  const disabled = await page.request.patch(`/api/access/users/${account.id}`, {
    headers,
    data: { status: 'disabled' },
  });
  expect(disabled.status()).toBe(200);
  expect((await member.request.get('/api/auth/me')).status()).toBe(401);
  const disabledLogin = await member.request.post('/api/auth/login', {
    data: { identifier: phone, password: resetPassword },
  });
  expect(disabledLogin.status()).toBe(401);
  await memberContext.close();

  await page.goto('/admin/access/users');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/05-accounts.png`, fullPage: true });
  await page.goto('/admin/access/roles');
  await expect(page.getByRole('heading', { name: '角色与权限' })).toBeVisible();
  await expect(page.getByText(teacher!.name, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/06-roles.png`, fullPage: true });
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/07-audit.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('真实 Web 入口与移动端登录页面', async ({ page }) => {
  await page.goto('http://127.0.0.1:15174');
  await expect(
    page.getByRole('link', { name: /进入.*后台|进入.*OMS|打开.*后台/ }).first(),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/08-web.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/login');
  await expect(page.getByLabel('邮箱或手机号')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${screenshots}/09-mobile-login.png`, fullPage: true });
});
