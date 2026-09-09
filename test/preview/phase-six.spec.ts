import { expect, test, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/phase-six';
const institutionName = 'P6 教学资源演示机构';

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

async function chooseInstitution(page: Page) {
  const select = page.locator('.ant-select').first();
  await select.click();
  await page.locator('.ant-select-item-option').filter({ hasText: institutionName }).click();
  await page.keyboard.press('Escape');
}

test('真实 Web：可选教学资源、独立排课计划与课次快照', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  await page.goto('/admin/teaching-resources');
  await expect(page.getByRole('heading', { name: '教学资源' })).toBeVisible();
  await chooseInstitution(page);
  await expect(page.getByText('创意书法', { exact: true })).toBeVisible();
  await expect(page.getByText('可选，不影响课时权益').first()).toBeVisible();
  await page.screenshot({ path: `${screenshots}/01-courses.png`, fullPage: true });

  await page.getByRole('tab', { name: '班级' }).click();
  const classRow = page.getByRole('row').filter({ hasText: '周末成长班' });
  await expect(classRow).toBeVisible();
  await classRow.getByRole('button', { name: '名单' }).click();
  const rosterDialog = page.getByRole('dialog', { name: /替换学员名单/ });
  await expect(rosterDialog).toBeVisible();
  await expect(rosterDialog.getByText('P6 学员小林', { exact: true })).toBeVisible();
  await expect(rosterDialog.getByText('P6 学员小周', { exact: true })).toBeVisible();
  await expect(rosterDialog.getByText('P6 学员小陈', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-class-roster.png`, fullPage: true });
  await rosterDialog.getByRole('button', { name: /取\s*消/ }).click();

  await page.getByRole('tab', { name: '组织共享' }).click();
  await expect(page.getByText('成长空间共享校区', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '教室' }).click();
  const room = page.getByText('多功能教室 A', { exact: true });
  if (!(await room.isVisible())) {
    const classroomPanel = page.getByRole('tabpanel', { name: '教室' });
    await classroomPanel.getByRole('combobox').click();
    await page.locator('.ant-select-item-option').filter({ hasText: '成长空间共享校区' }).click();
  }
  await expect(room).toBeVisible();
  await page.screenshot({ path: `${screenshots}/03-shared-spaces.png`, fullPage: true });

  await page.goto('/admin/schedule-plans');
  await expect(page.getByRole('heading', { name: '排课计划' })).toBeVisible();
  await chooseInstitution(page);
  const scheduleRow = page.getByRole('row').filter({ hasText: 'P6 周末排课演示' });
  await expect(scheduleRow).toBeVisible();
  await expect(page.getByText('生成后课次与计划独立。')).toBeVisible();
  await page.screenshot({ path: `${screenshots}/04-schedule-plan.png`, fullPage: true });
  await scheduleRow.getByRole('button', { name: '生成课次' }).click();
  const generateDialog = page.getByRole('dialog', { name: /生成课次/ });
  const copyRoster = generateDialog.getByRole('checkbox', {
    name: '复制班级当前学员到课次名单',
  });
  await expect(copyRoster).not.toBeChecked();
  await expect(generateDialog.getByText('默认关闭；复制后名单与班级独立')).toBeVisible();
  await page.screenshot({ path: `${screenshots}/05-generate-defaults.png`, fullPage: true });
  await generateDialog.getByRole('button', { name: /取\s*消/ }).click();

  await page.goto('/admin/lesson-sessions');
  await expect(page.getByRole('heading', { name: '课次管理', exact: true })).toBeVisible();
  await chooseInstitution(page);
  const sessionRow = page
    .locator('.session-list-row')
    .filter({ hasText: '创意书法演示课' })
    .first();
  await expect(sessionRow).toBeVisible();
  await sessionRow.click();
  await expect(page.getByText('课程：创意书法', { exact: true })).toBeVisible();
  await expect(page.getByText('班级：周末成长班', { exact: true })).toBeVisible();
  await expect(page.getByText('校区：成长空间共享校区', { exact: true })).toBeVisible();
  await expect(page.getByText('教室：多功能教室 A', { exact: true })).toBeVisible();
  for (const student of ['P6 学员小林', 'P6 学员小周', 'P6 学员小陈']) {
    await expect(page.getByText(student, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: `${screenshots}/06-independent-session.png`, fullPage: true });
  expect(errors).toEqual([]);
});
