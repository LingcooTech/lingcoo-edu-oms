import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱或手机号').fill(process.env.BOOTSTRAP_OWNER_EMAIL!);
  await page.getByLabel('密码', { exact: true }).fill(process.env.BOOTSTRAP_OWNER_PASSWORD!);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).not.toHaveURL(/login/);
}

test('招生转化和内容营销后台流程可用', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  const suffix = Date.now();
  await page.goto('/admin/admissions/leads');
  await expect(page.getByRole('heading', { name: '招生转化', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '线索跟进', selected: true })).toBeVisible();
  await page.getByRole('button', { name: '新增线索' }).click();
  const leadDialog = page.getByRole('dialog', { name: '新增线索' });
  await leadDialog.getByLabel('学员姓名').fill(`验收学员${suffix}`);
  await leadDialog.getByLabel('家长姓名').fill('验收家长');
  await leadDialog.getByLabel('联系电话').fill(`138${String(suffix).slice(-8)}`);
  await leadDialog.getByRole('textbox', { name: '来源', exact: true }).fill('内容文章');
  const leadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/admissions/leads',
  );
  await leadDialog.getByRole('button', { name: '保存线索' }).click();
  expect((await leadResponse).status()).toBe(201);
  await expect(page.getByText(`验收学员${suffix}`, { exact: true })).toBeVisible();

  await page
    .locator('.ant-table-row')
    .filter({ hasText: `验收学员${suffix}` })
    .getByRole('button', { name: '处理' })
    .click();
  const detail = page.getByRole('dialog', { name: `处理线索：验收学员${suffix}` });
  await detail.locator('textarea').first().fill('已完成首次沟通，安排后续体验。');
  const followUpResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/follow-ups'),
  );
  await detail.getByRole('button', { name: '保存跟进记录' }).click();
  expect((await followUpResponse).status()).toBe(200);
  await expect(detail.getByText('已完成首次沟通，安排后续体验。')).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/admissions/01-lead-follow-up.png',
    fullPage: true,
  });
  await detail.getByRole('button', { name: /关\s*闭|取\s*消/ }).click();

  await page.goto('/admin/admissions/trials');
  await expect(page.getByRole('heading', { name: '招生转化', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '试听转化', selected: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增试听场次' })).toBeVisible();
  await page.getByRole('button', { name: '新增试听场次' }).click();
  const trialDialog = page.getByRole('dialog', { name: '新增试听场次' });
  await expect(trialDialog.getByLabel('所属机构')).toBeVisible();
  await expect(trialDialog.getByLabel('校区（可选）')).toBeVisible();
  await expect(trialDialog.getByLabel('课程（可选）')).toBeVisible();
  await expect(trialDialog.getByLabel('教师（可选）')).toBeVisible();
  await trialDialog.getByRole('button', { name: /取\s*消/ }).click();
  await page.screenshot({
    path: 'docs/acceptance/admissions/02-trial-conversion.png',
    fullPage: true,
  });

  await page.goto('/admin/content');
  await expect(page.getByRole('heading', { name: '内容营销', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新建内容' }).click();
  const contentDialog = page.getByRole('dialog', { name: '新建内容' });
  await contentDialog.getByLabel('标题').fill(`招生内容验收${suffix}`);
  await contentDialog.getByLabel('正文 HTML / 富文本内容').fill('<p>成长空间体验内容。</p>');
  const contentResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/content',
  );
  await contentDialog.getByRole('button', { name: '保存内容' }).click();
  expect((await contentResponse).status()).toBe(201);
  await expect(page.getByText(`招生内容验收${suffix}`, { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/admissions/03-content-marketing.png',
    fullPage: true,
  });

  expect(errors).toEqual([]);
});
