import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/phase-two';

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

test('真实 Web：机构、组织级学员、已验证家长和教师档案', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await expect(page.getByRole('heading', { name: '教育运营工作台' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/01-dashboard.png`, fullPage: true });

  const suffix = Date.now().toString().slice(-6);
  await page.goto('/admin/organization');
  await expect(page.getByRole('heading', { name: '组织设置' })).toBeVisible();
  await page.getByRole('button', { name: '编辑组织资料' }).click();
  const organizationDialog = page.getByRole('dialog', { name: '编辑组织资料' });
  await expect(organizationDialog).toBeVisible();
  await page.waitForTimeout(400);
  await organizationDialog.getByLabel('组织全称').fill(`灵可教育服务有限公司 ${suffix}`);
  await organizationDialog.getByLabel('品牌名称').fill(`灵可成长空间 ${suffix}`);
  await organizationDialog.getByLabel('组织 Logo URL').fill('');
  await organizationDialog.getByLabel('联系电话').fill('0571-88888888');
  await organizationDialog.getByLabel('经营地址').fill('文具店二层成长空间');
  await expect(organizationDialog.getByLabel('品牌名称')).toHaveValue(`灵可成长空间 ${suffix}`);
  await page.screenshot({ path: `${screenshots}/07-organization-modal.png`, fullPage: true });
  await organizationDialog.getByRole('button', { name: /保\s*存/ }).click();
  await expect(organizationDialog).toBeHidden();
  await expect(
    page.getByRole('heading', { name: `灵可成长空间 ${suffix}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/08-organization.png`, fullPage: true });

  const sessionResponse = await page.request.get('/api/auth/me');
  expect(sessionResponse.status()).toBe(200);
  const csrf = (await sessionResponse.json()).csrfToken as string;
  const institution = await post(page.request, '/api/institutions', csrf, {
    name: `成长空间自营 ${suffix}`,
    type: 'self_operated',
    contactName: '运营负责人',
    contactPhone: '13800138000',
    address: '文具店二层成长空间',
    intro: '为社区儿童提供灵活、稳定的成长服务。',
    contact: '王老师 13800138000',
    sortOrder: 1,
  });
  const partner = await post(page.request, '/api/institutions', csrf, {
    name: `合作书法机构 ${suffix}`,
    type: 'partner',
  });
  const student = await post(page.request, `/api/institutions/${institution.id}/students`, csrf, {
    fullName: `林小满 ${suffix}`,
    grade: '三年级',
    school: '实验小学',
  });
  await post(page.request, `/api/institutions/${partner.id}/student-services`, csrf, {
    studentId: student.id,
  });
  await post(
    page.request,
    `/api/institutions/${institution.id}/students/${student.id}/guardians`,
    csrf,
    {
      fullName: `林女士 ${suffix}`,
      phone: `139${Date.now().toString().slice(-8)}`,
      relationship: '母亲',
      isPrimary: true,
    },
  );
  await post(page.request, `/api/institutions/${institution.id}/teachers`, csrf, {
    fullName: `陈老师 ${suffix}`,
    phone: null,
    title: '资深书法教师',
    tagline: '尊重孩子的节奏，守住长期成长。',
    teachingExperience: '八年儿童书法教学经验',
    teachingPhilosophy: '以稳定的反馈帮助孩子建立自信。',
    specialties: ['硬笔书法', '软笔书法'],
    isPinned: true,
  });

  await page.goto('/admin/institutions');
  await expect(page.getByRole('heading', { name: '机构管理' })).toBeVisible();
  await expect(page.getByText(institution.name, { exact: true })).toBeVisible();
  await expect(page.getByText(partner.name, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-institutions.png`, fullPage: true });
  await page
    .getByRole('row')
    .filter({ hasText: institution.name })
    .getByRole('button', { name: '编辑' })
    .click();
  const institutionDialog = page.getByRole('dialog', { name: '编辑机构' });
  await expect(institutionDialog.getByLabel('机构介绍')).toHaveValue(
    '为社区儿童提供灵活、稳定的成长服务。',
  );
  await page.screenshot({ path: `${screenshots}/09-institution-modal.png`, fullPage: true });
  await institutionDialog.getByRole('button', { name: /取\s*消/ }).click();

  await page.goto('/admin/students');
  await expect(page.getByRole('heading', { name: '学员与家长' })).toBeVisible();
  await page.getByRole('combobox').first().fill(institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: institution.name }).click();
  await expect(page.getByText(student.fullName, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/03-students.png`, fullPage: true });
  await page
    .getByRole('row')
    .filter({ hasText: student.fullName })
    .getByRole('button', { name: '家长' })
    .click();
  await expect(page.getByText(`林女士 ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText('已验证', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/04-student-guardians.png`, fullPage: true });
  await page.goto('/admin/teachers');
  await expect(page.getByRole('heading', { name: '教师档案' })).toBeVisible();
  await page.getByRole('combobox').fill(institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: institution.name }).click();
  await expect(page.getByText(`陈老师 ${suffix}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/05-teachers.png`, fullPage: true });
  await page
    .getByRole('row')
    .filter({ hasText: `陈老师 ${suffix}` })
    .getByRole('button', { name: '编辑' })
    .click();
  const teacherDialog = page.getByRole('dialog', { name: '编辑教师档案' });
  await expect(teacherDialog.getByLabel('职称 / 头衔')).toHaveValue('资深书法教师');
  await page.screenshot({ path: `${screenshots}/10-teacher-modal.png`, fullPage: true });
  await teacherDialog.getByRole('button', { name: /取\s*消/ }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/students');
  await expect(page.getByRole('heading', { name: '学员与家长' })).toBeVisible();
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `${screenshots}/06-mobile-students.png`, fullPage: true });
  expect(errors).toEqual([]);
});
