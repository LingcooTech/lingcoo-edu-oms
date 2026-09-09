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

test('管理端新菜单与快捷建档入口可用', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  for (const section of [
    '业务概览',
    '教学资源',
    '招生转化',
    '教务管理',
    '课时账本',
    '小程序设置',
    '系统设置',
  ]) {
    await expect(page.getByText(section, { exact: true }).first()).toBeVisible();
  }
  await page.getByText('教务管理', { exact: true }).first().click();
  await page.getByText('课时账本', { exact: true }).first().click();
  for (const section of ['教学资源', '招生转化', '小程序设置', '系统设置']) {
    await page.getByText(section, { exact: true }).first().click();
  }
  await expect(page.getByText('学员档案', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('家长绑定', { exact: true })).toHaveCount(0);
  await expect(page.getByText('课时流水', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.admin-sider__footer')).toContainText('owner@lingcoo.local');
  await expect(page.locator('.admin-sider__footer')).not.toContainText('教育运营管理系统');
  const navigationBox = await page.locator('.admin-navigation').boundingBox();
  const userCardBox = await page.locator('.admin-sider__footer').boundingBox();
  expect(navigationBox).not.toBeNull();
  expect(userCardBox).not.toBeNull();
  expect(navigationBox!.y + navigationBox!.height).toBeLessThanOrEqual(userCardBox!.y + 1);
  await page.screenshot({
    path: 'docs/acceptance/admin-navigation/01-navigation-and-dashboard.png',
    fullPage: true,
  });

  await page.getByText('快捷操作', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: '快捷操作', exact: true })).toBeVisible();
  for (const action of ['添加学员', '发放课时', '班级安排', '排课计划', '签到消课']) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }
  await page.screenshot({
    path: 'docs/acceptance/admin-navigation/02-quick-actions.png',
    fullPage: true,
  });

  await page
    .locator('.ant-card')
    .filter({ hasText: '添加学员' })
    .getByText('开始操作', { exact: false })
    .click();
  const dialog = page.getByRole('dialog', { name: '新建学员' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('姓名')).toBeVisible();
  await expect(dialog.getByLabel('年级 / 年龄')).toBeVisible();
  await expect(dialog.getByLabel('学校')).toBeVisible();
  await page.screenshot({
    path: 'docs/acceptance/admin-navigation/03-create-student-modal.png',
    fullPage: true,
  });
  await dialog.getByRole('button', { name: /取\s*消/ }).click();

  for (const resourcePage of [
    { path: '/admin/courses', heading: '课程管理' },
    { path: '/admin/campuses', heading: '校区管理' },
    { path: '/admin/classrooms', heading: '教室管理' },
    { path: '/admin/classes', heading: '班级管理' },
  ]) {
    await page.goto(resourcePage.path);
    await expect(
      page.getByRole('heading', { name: resourcePage.heading, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.ant-tabs-nav:visible')).toHaveCount(0);
  }
  await page.screenshot({
    path: 'docs/acceptance/admin-navigation/04-separate-class-page-and-user-card.png',
    fullPage: true,
  });

  await page.goto('/admin/guardian-bindings');
  await expect(page.getByText('页面不存在', { exact: true })).toBeVisible();

  await page.goto('/admin/lesson-movements');
  await expect(page.getByRole('heading', { name: '课时流水', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '课时流水', selected: true })).toBeVisible();
  expect(errors).toEqual([]);
});
