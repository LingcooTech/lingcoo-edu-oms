import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/phase-eleven';

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

async function api(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  csrf: string,
  data?: unknown,
  headers?: Record<string, string>,
) {
  const response = await request.fetch(path, {
    method,
    headers: method === 'GET' ? headers : { 'x-csrf-token': csrf, ...headers },
    data,
  });
  return response;
}

async function json<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  csrf: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await api(request, method, path, csrf, data, headers);
  expect(response.status(), await response.text()).toBeGreaterThanOrEqual(200);
  expect(response.status(), await response.text()).toBeLessThan(300);
  return response.json() as Promise<T>;
}

async function fixture(page: Page, suffix: string) {
  const session = await json<{ csrfToken: string }>(page.request, 'GET', '/api/auth/me', '');
  const csrf = session.csrfToken;
  const institution = await json<{ id: string; name: string }>(
    page.request,
    'POST',
    '/api/institutions',
    csrf,
    { name: `P11 验收机构 ${suffix}`, type: 'partner' },
  );
  const campus = await json<{ id: string }>(page.request, 'POST', '/api/campuses', csrf, {
    name: `P11 验收校区 ${suffix}`,
    code: `P11-${suffix}`,
    environmentImageUrls: [],
  });
  const student = await json<{ id: string }>(
    page.request,
    'POST',
    `/api/institutions/${institution.id}/students`,
    csrf,
    { fullName: `P11 学员 ${suffix}` },
  );
  const binding = await json<{ guardian: { id: string } }>(
    page.request,
    'POST',
    `/api/institutions/${institution.id}/students/${student.id}/guardians`,
    csrf,
    {
      fullName: `P11 家长 ${suffix}`,
      phone: `139${suffix.slice(-8)}`,
      relationship: '母亲',
      isPrimary: true,
    },
  );
  return { csrf, institution, campus, student, guardianId: binding.guardian.id };
}

test('真实预览：课程系列 CRUD，并作为课程目录关联而不约束课时', async ({ page }) => {
  const suffix = Date.now().toString();
  await login(page);
  const setup = await fixture(page, suffix);
  const series = await json<{ id: string; revision: number; name: string }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/course-series`,
    setup.csrf,
    { name: `P11 艺术启蒙 ${suffix}`, code: `art-${suffix}`, status: 'active' },
  );
  const course = await json<{ id: string; courseSeriesId: string | null; revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/courses`,
    setup.csrf,
    {
      name: `P11 绘画课 ${suffix}`,
      code: `paint-${suffix}`,
      courseSeriesId: series.id,
      durationMinutes: 60,
      status: 'active',
    },
  );
  expect(course.courseSeriesId).toBe(series.id);
  const updated = await json<{ revision: number; description: string | null }>(
    page.request,
    'PATCH',
    `/api/institutions/${setup.institution.id}/course-series/${series.id}`,
    setup.csrf,
    { expectedRevision: series.revision, description: 'P11 目录分类验收', status: 'inactive' },
  );
  expect(updated.description).toBe('P11 目录分类验收');
  const blockedDelete = await api(
    page.request,
    'DELETE',
    `/api/institutions/${setup.institution.id}/course-series/${series.id}`,
    setup.csrf,
    { expectedRevision: updated.revision },
  );
  expect(blockedDelete.status(), await blockedDelete.text()).toBe(409);
  await json(
    page.request,
    'PATCH',
    `/api/institutions/${setup.institution.id}/courses/${course.id}`,
    setup.csrf,
    { expectedRevision: course.revision, courseSeriesId: null },
  );
  await json(
    page.request,
    'DELETE',
    `/api/institutions/${setup.institution.id}/course-series/${series.id}`,
    setup.csrf,
    { expectedRevision: updated.revision },
  );

  await page.goto('/admin/course-series');
  await expect(page.getByRole('heading', { name: '课程系列' })).toBeVisible();
  const courseSeriesInstitutionSelect = page.locator('.ant-select').first();
  await courseSeriesInstitutionSelect.click();
  await courseSeriesInstitutionSelect.locator('input').fill(setup.institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: setup.institution.name }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await expect(page.getByText('加载中')).toHaveCount(0);
  await expect(page.locator('.ant-empty-description', { hasText: '暂无数据' })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/01-course-series.png`, fullPage: true });
});

test('真实预览：普通线下订单申请、审批回收权益、确认退款闭环', async ({ page }) => {
  const suffix = Date.now().toString();
  await login(page);
  const setup = await fixture(page, suffix);
  const product = await json<{ id: string }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/lesson-packages`,
    setup.csrf,
    {
      name: `P11 退款课时包 ${suffix}`,
      baseUnits: 5,
      bonusUnits: 0,
      priceAmount: 5000,
      currency: 'CNY',
      onlineSaleEnabled: false,
    },
  );
  const order = await json<{ id: string; orderNo: string; revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/orders/offline`,
    setup.csrf,
    {
      student: { kind: 'existing', studentId: setup.student.id, guardianId: setup.guardianId },
      packageId: product.id,
      paidAmountMinor: 5000,
      paymentMethod: 'cash',
      receivedAt: new Date().toISOString(),
    },
    { 'idempotency-key': randomUUID() },
  );
  const accountPath = `/api/institutions/${setup.institution.id}/students/${setup.student.id}/lesson-account`;
  expect(
    (await json<{ balanceUnits: number }>(page.request, 'GET', accountPath, setup.csrf))
      .balanceUnits,
  ).toBe(5);
  const refund = await json<{ id: string; status: string; revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/orders/${order.id}/refunds`,
    setup.csrf,
    { expectedOrderRevision: order.revision, requestKey: randomUUID(), reason: 'P11 家长申请退款' },
  );
  expect(refund.status).toBe('requested');
  const approved = await json<{ status: string; revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/refunds/${refund.id}/actions/approve`,
    setup.csrf,
    { expectedRevision: refund.revision, note: 'P11 审批通过' },
  );
  expect(approved.status).toBe('awaiting_offline_refund');
  expect(
    (await json<{ balanceUnits: number }>(page.request, 'GET', accountPath, setup.csrf))
      .balanceUnits,
  ).toBe(0);

  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: '订单与收款' })).toBeVisible();
  const refundInstitutionSelect = page.locator('.ant-select').first();
  await refundInstitutionSelect.click();
  await refundInstitutionSelect.locator('input').fill(setup.institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: setup.institution.name }).click();
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('订单号、学员、家长或商品').fill(order.orderNo);
  await page.getByPlaceholder('订单号、学员、家长或商品').press('Enter');
  const refundingRow = page.getByRole('row').filter({ hasText: order.orderNo });
  await expect(refundingRow).toBeVisible();
  await refundingRow.getByRole('button', { name: '继续退款' }).click();
  const refundDialog = page.getByRole('dialog', { name: '普通订单退款' });
  await expect(
    refundDialog.getByText('权益已回收。请在线下实际退款后再确认，系统不会自动转账。'),
  ).toBeVisible();
  await page.screenshot({
    path: `${screenshots}/02-order-refund-awaiting-offline.png`,
    fullPage: true,
  });
  await refundDialog.getByRole('button', { name: '关闭' }).click();

  const completed = await json<{ status: string }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/refunds/${refund.id}/actions/confirm-offline`,
    setup.csrf,
    {
      expectedRevision: approved.revision,
      paymentMethod: 'cash',
      refundedAt: new Date().toISOString(),
      paymentReference: `P11-REFUND-${suffix}`,
      note: 'P11 已现金退款',
    },
  );
  expect(completed.status).toBe('completed');

  await page.reload();
  await expect(page.getByRole('heading', { name: '订单与收款' })).toBeVisible();
  const completedInstitutionSelect = page.locator('.ant-select').first();
  await completedInstitutionSelect.click();
  await completedInstitutionSelect.locator('input').fill(setup.institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: setup.institution.name }).click();
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('订单号、学员、家长或商品').fill(order.orderNo);
  await page.getByPlaceholder('订单号、学员、家长或商品').press('Enter');
  await expect(
    page.getByRole('row').filter({ hasText: order.orderNo }).getByText('已退款'),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-order-refund-completed.png`, fullPage: true });
});

test('真实预览：已收意向金必须先退款，才可退出或取消拼课', async ({ page }) => {
  const suffix = Date.now().toString();
  await login(page);
  const setup = await fixture(page, suffix);
  const course = await json<{ id: string }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/courses`,
    setup.csrf,
    { name: `P11 拼课课程 ${suffix}`, durationMinutes: 60, status: 'active' },
  );
  const campaign = await json<{ id: string; revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns`,
    setup.csrf,
    {
      title: `P11 拼课 ${suffix}`,
      courseId: course.id,
      campusId: setup.campus.id,
      minParticipants: 2,
      maxParticipants: 4,
      depositAmountMinor: 1000,
      plannedSessionCount: 4,
      unitsPerSession: 1,
      durationMinutes: 60,
      recruitmentDeadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
      priceTiers: [{ minParticipants: 2, maxParticipants: 4, unitPriceMinor: 12_000 }],
    },
  );
  await json<{ revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/actions/publish`,
    setup.csrf,
    { expectedRevision: campaign.revision },
  );
  const enrollment = await json<{ id: string; revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/enrollments`,
    setup.csrf,
    { studentId: setup.student.id, guardianId: setup.guardianId },
  );
  const paid = await json<{ revision: number }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/enrollments/${enrollment.id}/deposit`,
    setup.csrf,
    { expectedRevision: enrollment.revision, paidAmountMinor: 1000, paymentMethod: 'cash' },
  );
  const beforeBlockedCancel = await json<{ campaign: { revision: number } }>(
    page.request,
    'GET',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}`,
    setup.csrf,
  );
  const blockedCancel = await api(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/actions/cancel`,
    setup.csrf,
    { expectedRevision: beforeBlockedCancel.campaign.revision, reason: 'P11 未退款阻断验收' },
  );
  expect(blockedCancel.status(), await blockedCancel.text()).toBe(409);
  const refunded = await json<{
    status: string;
    revision: number;
    depositRefund: { amountMinor: number };
  }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/enrollments/${enrollment.id}/actions/refund-deposit`,
    setup.csrf,
    {
      expectedRevision: paid.revision,
      refundedAmountMinor: 1000,
      refundMethod: 'cash',
      refundNote: 'P11 已实际退回意向金',
    },
    { 'idempotency-key': randomUUID() },
  );
  expect(refunded).toMatchObject({
    status: 'deposit_refunded',
    depositRefund: { amountMinor: 1000 },
  });
  const withdrawn = await json<{ status: string }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/enrollments/${enrollment.id}/actions/withdraw`,
    setup.csrf,
    { expectedRevision: refunded.revision, reason: 'P11 家长退出拼课' },
    { 'idempotency-key': randomUUID() },
  );
  expect(withdrawn.status).toBe('withdrawn');
  const detail = await json<{ campaign: { revision: number } }>(
    page.request,
    'GET',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}`,
    setup.csrf,
  );
  const cancelled = await json<{ status: string; cancellationReason: string }>(
    page.request,
    'POST',
    `/api/institutions/${setup.institution.id}/group-matching/campaigns/${campaign.id}/actions/cancel`,
    setup.csrf,
    { expectedRevision: detail.campaign.revision, reason: 'P11 招募取消' },
  );
  expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'P11 招募取消' });

  await page.goto('/admin/group-matching');
  await expect(page.getByRole('heading', { name: '拼课管理' })).toBeVisible();
  const select = page.locator('.ant-select').first();
  await select.click();
  await select.locator('input').fill(setup.institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: setup.institution.name }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0);
  await expect(page.getByText(`P11 拼课 ${suffix}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/03-group-exit-and-cancelled.png`, fullPage: true });
});
