import { createHmac, randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/period-card-orders';
const mockSecret = 'period-card-orders-preview-signing-secret-2026';

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

test('真实数据库：周期卡线上支付与线下收款统一履约并生成收据', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
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
    ['payments.mock.app-id', 'period-card-orders-preview-app'],
    ['payments.mock.merchant-id', 'period-card-orders-preview-merchant'],
    ['payments.mock.signing-secret', mockSecret],
    ['education-commerce.online-sales-enabled', true],
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
      data: { name: `周期卡订单演示机构 ${suffix}`, type: 'partner' },
    }),
    201,
  );
  const onboarding = await expectJson(
    await page.request.post('/api/mini/students', {
      headers: mutationHeaders,
      data: {
        institutionId: institution.id,
        guardianName: `周期卡家长 ${suffix}`,
        relationship: '家长',
        student: { fullName: `周期卡学员 ${suffix}`, grade: '五年级' },
      },
    }),
    201,
  );
  const product = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/period-card-products`, {
      headers: { ...mutationHeaders, 'idempotency-key': randomUUID() },
      data: {
        name: `30 天畅学卡 ${suffix}`,
        description: '线上线下统一订单验收商品',
        mode: 'limited',
        usageLimit: 12,
        durationUnit: 'day',
        durationCount: 30,
        activationPolicy: 'on_first_use',
        priceAmount: 29_900,
        currency: 'CNY',
        onlineSaleEnabled: true,
      },
    }),
    201,
  );

  const catalogResponse = await page.request.get(
    `/api/mini/period-card-products?institutionId=${institution.id}`,
  );
  expect(catalogResponse.status(), await catalogResponse.text()).toBe(200);
  expect(await catalogResponse.json()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: product.id, priceAmount: 29_900 })]),
  );

  const checkout = await expectJson(
    await page.request.post('/api/mini/orders', {
      headers: { ...mutationHeaders, 'idempotency-key': randomUUID() },
      data: {
        productType: 'period_card',
        institutionId: institution.id,
        studentId: onboarding.student.id,
        periodCardProductId: product.id,
        provider: 'mock',
      },
    }),
    201,
  );
  expect(checkout.order).toMatchObject({
    productType: 'period_card',
    status: 'pending_payment',
    periodCardProductId: product.id,
    periodCardProductVersion: 1,
    periodCardEntitlementId: null,
    grantMovementId: null,
  });

  const callbackPayload = {
    providerEventId: `period-card-${randomUUID()}`,
    providerTransactionId: checkout.payment.transactions[0].providerTransactionId,
    appId: 'period-card-orders-preview-app',
    merchantId: 'period-card-orders-preview-merchant',
    eventType: 'payment.succeeded',
    amountMinor: 29_900,
    currency: 'CNY',
    occurredAt: new Date().toISOString(),
  };
  const signature = createHmac('sha256', mockSecret)
    .update(JSON.stringify(callbackPayload))
    .digest('hex');
  const callback = await page.request.post('/api/payments/providers/mock/callback', {
    headers: { 'x-payment-signature': signature },
    data: callbackPayload,
  });
  expect(callback.status(), await callback.text()).toBe(200);
  const duplicate = await page.request.post('/api/payments/providers/mock/callback', {
    headers: { 'x-payment-signature': signature },
    data: callbackPayload,
  });
  expect(duplicate.status(), await duplicate.text()).toBe(200);
  expect(await duplicate.json()).toMatchObject({ accepted: true, deduplicated: true });

  const completedResponse = await page.request.get(`/api/mini/orders/${checkout.order.id}`);
  expect(completedResponse.status(), await completedResponse.text()).toBe(200);
  const completed = await completedResponse.json();
  expect(completed).toMatchObject({
    status: 'completed',
    productType: 'period_card',
    grantMovementId: null,
  });
  expect(completed.periodCardEntitlementId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  const onlineReceipt = await page.request.get(
    `/api/institutions/${institution.id}/orders/${checkout.order.id}/receipt`,
  );
  expect(onlineReceipt.status(), await onlineReceipt.text()).toBe(200);
  expect(await onlineReceipt.json()).toMatchObject({
    settlementMark: '款项已收',
    order: {
      productType: 'period_card',
      periodCardEntitlementId: completed.periodCardEntitlementId,
    },
  });

  const offlineKey = randomUUID();
  const offlinePayload = {
    productType: 'period_card',
    student: {
      kind: 'existing',
      studentId: onboarding.student.id,
      guardianId: onboarding.guardian.guardian.id,
    },
    periodCardProductId: product.id,
    paidAmountMinor: 28_000,
    paymentMethod: 'cash',
    receivedAt: new Date().toISOString(),
    paymentReference: `CASH-PC-${suffix}`,
    priceAdjustmentReason: '周期卡订单验收优惠',
  };
  const offline = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/orders/offline`, {
      headers: { ...mutationHeaders, 'idempotency-key': offlineKey },
      data: offlinePayload,
    }),
    201,
  );
  expect(offline).toMatchObject({
    productType: 'period_card',
    channel: 'offline',
    paymentMethod: 'cash',
    status: 'completed',
  });
  expect(offline.periodCardEntitlementId).not.toBe(completed.periodCardEntitlementId);
  const duplicateOffline = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/orders/offline`, {
      headers: { ...mutationHeaders, 'idempotency-key': offlineKey },
      data: offlinePayload,
    }),
    201,
  );
  expect(duplicateOffline.id).toBe(offline.id);

  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: '订单与收款' })).toBeVisible();
  const institutionSelect = page.locator('.ant-select').first();
  await institutionSelect.click();
  await institutionSelect.locator('input').fill(institution.name);
  await page.locator('.ant-select-item-option').filter({ hasText: institution.name }).click();
  await expect(page.getByText(checkout.order.orderNo, { exact: true })).toBeVisible();
  await expect(page.getByText(offline.orderNo, { exact: true })).toBeVisible();
  await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${screenshots}/period-card-orders.png`, fullPage: true });

  const row = page.getByRole('row').filter({ hasText: offline.orderNo });
  await row.getByRole('button', { name: '收据' }).click();
  await expect(page.getByText('现金收讫', { exact: true })).toBeVisible();
  await expect(page.getByText(/30天，限 12 次，首次使用激活/)).toBeVisible();
  await page.screenshot({ path: `${screenshots}/period-card-receipt.png`, fullPage: true });
  expect(pageErrors).toEqual([]);
});
