import { createHmac, randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/lesson-commerce';
const mockSecret = 'lesson-commerce-preview-signing-secret-2026';

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

async function expectJson(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  status: number,
) {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test('真实数据库：家长先建学员，支付后自动创建账户并幂等发放课时', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);

  const meResponse = await page.request.get('/api/auth/me');
  expect(meResponse.status()).toBe(200);
  const csrf = (await meResponse.json()).csrfToken as string;
  const mutationHeaders = { 'x-csrf-token': csrf };
  const settingsResponse = await page.request.get('/api/settings');
  expect(settingsResponse.status()).toBe(200);
  const settings = (await settingsResponse.json()).items as Array<{
    key: string;
    version: number | null;
  }>;
  for (const [key, value] of [
    ['payments.mock.app-id', 'lesson-commerce-preview-app'],
    ['payments.mock.merchant-id', 'lesson-commerce-preview-merchant'],
    ['payments.mock.signing-secret', mockSecret],
  ] as const) {
    const setting = settings.find((item) => item.key === key);
    expect(setting).toBeTruthy();
    const saved = await page.request.put(`/api/settings/${key}`, {
      headers: mutationHeaders,
      data: { value, expectedVersion: setting!.version },
    });
    expect(saved.status(), await saved.text()).toBe(200);
  }

  const suffix = Date.now().toString().slice(-8);
  const institution = await expectJson(
    await page.request.post('/api/institutions', {
      headers: mutationHeaders,
      data: { name: `线上购课演示机构 ${suffix}`, type: 'partner' },
    }),
    201,
  );
  const onboarding = await expectJson(
    await page.request.post('/api/mini/students', {
      headers: mutationHeaders,
      data: {
        institutionId: institution.id,
        guardianName: `演示家长 ${suffix}`,
        relationship: '母亲',
        student: {
          fullName: `线上购课学员 ${suffix}`,
          grade: '三年级',
          school: '灵可实验小学',
        },
      },
    }),
    201,
  );
  const lessonPackage = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/lesson-packages`, {
      headers: mutationHeaders,
      data: {
        name: `通用 12+2 课时 ${suffix}`,
        description: '仅绑定服务机构，不绑定课程、校区、教师或班级。',
        baseUnits: 12,
        bonusUnits: 2,
        priceAmount: 19_900,
        currency: 'CNY',
        onlineSaleEnabled: true,
      },
    }),
    201,
  );

  const packagesResponse = await page.request.get(
    `/api/mini/lesson-packages?institutionId=${institution.id}`,
  );
  expect(packagesResponse.status(), await packagesResponse.text()).toBe(200);
  expect((await packagesResponse.json()).map((item: { id: string }) => item.id)).toContain(
    lessonPackage.id,
  );

  const checkout = await expectJson(
    await page.request.post('/api/mini/orders', {
      headers: { ...mutationHeaders, 'idempotency-key': randomUUID() },
      data: {
        institutionId: institution.id,
        studentId: onboarding.student.id,
        packageId: lessonPackage.id,
        provider: 'mock',
      },
    }),
    201,
  );
  expect(checkout.order).toMatchObject({
    status: 'pending_payment',
    amountMinor: 19_900,
    baseUnits: 12,
    bonusUnits: 2,
  });

  const callbackPayload = {
    providerEventId: `preview-${randomUUID()}`,
    providerTransactionId: checkout.payment.transactions[0].providerTransactionId,
    appId: 'lesson-commerce-preview-app',
    merchantId: 'lesson-commerce-preview-merchant',
    eventType: 'payment.succeeded',
    amountMinor: 19_900,
    currency: 'CNY',
    occurredAt: new Date().toISOString(),
  };
  const callbackSignature = createHmac('sha256', mockSecret)
    .update(JSON.stringify(callbackPayload))
    .digest('hex');
  const callback = await page.request.post('/api/payments/providers/mock/callback', {
    headers: { 'x-payment-signature': callbackSignature },
    data: callbackPayload,
  });
  expect(callback.status(), await callback.text()).toBe(200);
  expect(await callback.json()).toMatchObject({ accepted: true, deduplicated: false });

  const duplicate = await page.request.post('/api/payments/providers/mock/callback', {
    headers: { 'x-payment-signature': callbackSignature },
    data: callbackPayload,
  });
  expect(duplicate.status(), await duplicate.text()).toBe(200);
  expect(await duplicate.json()).toMatchObject({ accepted: true, deduplicated: true });

  const orderResponse = await page.request.get(`/api/mini/orders/${checkout.order.id}`);
  expect(orderResponse.status(), await orderResponse.text()).toBe(200);
  expect(await orderResponse.json()).toMatchObject({
    status: 'completed',
    paymentIntentId: checkout.payment.id,
  });
  const accountResponse = await page.request.get(
    `/api/institutions/${institution.id}/students/${onboarding.student.id}/lesson-account`,
  );
  expect(accountResponse.status(), await accountResponse.text()).toBe(200);
  expect(await accountResponse.json()).toMatchObject({ balanceUnits: 14, activeBatchCount: 1 });

  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: '订单与收款' })).toBeVisible();
  const institutionSelect = page.locator('.ant-select').first();
  await institutionSelect.click();
  await institutionSelect.locator('input').fill(institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: institution.name }).click();
  await expect(page.getByText(checkout.order.orderNo, { exact: true })).toBeVisible();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible();
  await expect(page.getByText(onboarding.student.fullName, { exact: true })).toBeVisible();
  await expect(page.getByText('¥199.00', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/01-completed-order.png`, fullPage: true });

  await page.goto('/admin/lesson-accounts');
  await expect(page.getByRole('heading', { name: '课时账户' })).toBeVisible();
  await page.locator('.ant-select').nth(0).click();
  await page.locator('.ant-select-item-option').filter({ hasText: institution.name }).click();
  await page.locator('.ant-select').nth(1).click();
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: onboarding.student.fullName })
    .click();
  await expect(page.locator('.ant-statistic').filter({ hasText: '当前可用课时' })).toContainText(
    '14',
  );
  const grantedBatch = page
    .getByRole('row')
    .filter({ hasText: lessonPackage.name })
    .filter({ hasText: checkout.order.orderNo });
  await expect(grantedBatch).toBeVisible();
  await page.screenshot({ path: `${screenshots}/02-granted-account.png`, fullPage: true });

  expect(errors).toEqual([]);
});
