import { expect, test, type Page } from '@playwright/test';

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

test('系统设置展示品牌、七牛/S3、微信小程序、微信支付和 Notion 配置', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  await page.goto('/admin/settings');
  await expect(page.getByRole('heading', { name: '接口配置', exact: true })).toBeVisible();
  for (const group of ['应用信息', '邮件服务', '文件存储', '微信支付', '内容来源']) {
    await expect(page.getByRole('tab', { name: group })).toBeVisible();
  }
  await page.getByRole('tab', { name: '文件存储' }).click();
  await expect(page.locator('[data-setting-key="storage.provider"]')).toContainText('七牛 Kodo');
  await page.getByRole('tab', { name: '微信支付' }).click();
  await expect(page.getByText('商户 API 证书私钥', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '内容来源' }).click();
  await expect(page.getByText('Notion Token', { exact: true })).toBeVisible();
  await expect(page.getByText('Mock 回调签名密钥', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: 'docs/acceptance/system-settings/01-interface-settings.png',
    fullPage: true,
  });

  await page.goto('/admin/mini-program-settings');
  await expect(page.getByRole('heading', { name: '小程序设置', exact: true })).toBeVisible();
  await expect(page.getByText('小程序 AppID', { exact: true })).toBeVisible();
  await expect(page.getByText('小程序 AppSecret', { exact: true })).toBeVisible();
  await expect(page.getByText('课次提醒模板 ID', { exact: true })).toBeVisible();
  await expect(page.getByText('测试微信小程序连接', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/system-settings/02-mini-program-settings.png',
    fullPage: true,
  });

  await page.goto('/admin/branding');
  await expect(page.getByRole('heading', { name: '品牌设置', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '视觉主题' }).click();
  await expect(page.getByLabel('品牌主色')).toBeVisible();
  await expect(page.getByLabel('品牌辅助色')).toBeVisible();
  await expect(page.getByLabel('全局圆角')).toBeVisible();
  const [brandingUpdate] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith('/api/branding') && candidate.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: /保存全部品牌设置$/ }).click(),
  ]);
  expect(brandingUpdate.status(), await brandingUpdate.text()).toBe(200);
  await expect(page.getByText('品牌设置已更新')).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/system-settings/03-branding.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});
