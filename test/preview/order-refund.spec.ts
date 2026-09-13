import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/order-refund';

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

test('线下课时包退款后按原批次回收全部未消费课时', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const me = await page.request.get('/api/auth/me');
  const headers = { 'x-csrf-token': (await me.json()).csrfToken as string };
  const institutionsResponse = await page.request.get(
    '/api/institutions?page=1&pageSize=100&status=active',
  );
  const institution = (await institutionsResponse.json()).items[0] as { id: string };
  const suffix = Date.now().toString().slice(-8);
  const student = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/students`, {
      headers,
      data: { fullName: `退款验收学员 ${suffix}` },
    }),
    201,
  );
  const binding = await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/students/${student.id}/guardians`,
      {
        headers,
        data: {
          fullName: `退款验收家长 ${suffix}`,
          phone: `139${suffix}`,
          relationship: '父亲',
          isPrimary: true,
        },
      },
    ),
    201,
  );
  const product = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/lesson-packages`, {
      headers,
      data: {
        name: `退款验收 5 课时 ${suffix}`,
        description: '验证订单退款按原始发放批次整笔回收',
        baseUnits: 5,
        bonusUnits: 0,
        priceAmount: 5000,
        currency: 'CNY',
        onlineSaleEnabled: false,
      },
    }),
    201,
  );
  const order = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/orders/offline`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: {
        student: {
          kind: 'existing',
          studentId: student.id,
          guardianId: binding.guardian.id,
        },
        packageId: product.id,
        paidAmountMinor: 5000,
        paymentMethod: 'cash',
        receivedAt: new Date().toISOString(),
      },
    }),
    201,
  );
  expect(order).toMatchObject({ status: 'completed', productType: 'lesson_package' });
  const accountPath = `/api/institutions/${institution.id}/students/${student.id}/lesson-account`;
  expect((await (await page.request.get(accountPath)).json()).balanceUnits).toBe(5);

  await page.goto('/admin/orders');
  await expect(page.getByRole('heading', { name: '订单与收款' })).toBeVisible();
  await page.getByPlaceholder('订单号、学员、家长或商品').fill(order.orderNo);
  await page.getByPlaceholder('订单号、学员、家长或商品').press('Enter');
  let row = page.getByRole('row').filter({ hasText: order.orderNo });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '退款' }).click();
  const refundDialog = page.getByRole('dialog', { name: '退款并回收权益' });
  await refundDialog.getByLabel('退款原因').fill('家长取消，现金已原路退回');
  await page.screenshot({ path: `${screenshots}/refund-confirmation.png`, fullPage: true });
  await refundDialog.getByRole('button', { name: '确认已线下退款' }).click();
  await expect(refundDialog).not.toBeVisible();
  row = page.getByRole('row').filter({ hasText: order.orderNo });
  await expect(row.getByText('已退款', { exact: true })).toBeVisible();
  expect((await (await page.request.get(accountPath)).json()).balanceUnits).toBe(0);
  const movements = await (
    await page.request.get(`${accountPath}/movements?page=1&pageSize=20`)
  ).json();
  expect(movements.items[0]).toMatchObject({
    type: 'grant_reversal',
    direction: 'debit',
    units: 5,
  });
  const batches = await (
    await page.request.get(`${accountPath}/batches?page=1&pageSize=20`)
  ).json();
  expect(batches.items[0]).toMatchObject({ status: 'reversed', remainingUnits: 0 });

  const periodProduct = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/period-card-products`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: {
        name: `退款验收周期卡 ${suffix}`,
        description: '验证未使用周期卡随订单退款撤销',
        mode: 'limited',
        usageLimit: 4,
        durationUnit: 'month',
        durationCount: 1,
        activationPolicy: 'on_first_use',
        priceAmount: 3000,
        currency: 'CNY',
        onlineSaleEnabled: false,
      },
    }),
    201,
  );
  const periodOrder = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/orders/offline`, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: {
        student: {
          kind: 'existing',
          studentId: student.id,
          guardianId: binding.guardian.id,
        },
        productType: 'period_card',
        periodCardProductId: periodProduct.id,
        paidAmountMinor: 3000,
        paymentMethod: 'wechat_transfer',
        receivedAt: new Date().toISOString(),
      },
    }),
    201,
  );
  const periodUsage = await expectJson(
    await page.request.post(`/api/institutions/${institution.id}/period-card-usages`, {
      headers,
      data: {
        operationId: randomUUID(),
        entitlementId: periodOrder.periodCardEntitlementId,
        quantity: 1,
        sourceReference: `refund-eligibility:${periodOrder.orderNo}`,
        occurredAt: new Date().toISOString(),
        reason: '验证已使用权益不能自动退款',
      },
    }),
    201,
  );
  const rejectedRefund = await page.request.post(
    `/api/institutions/${institution.id}/orders/${periodOrder.id}/actions/refund`,
    {
      headers,
      data: { expectedRevision: periodOrder.revision, reason: '已使用权益退款应被拒绝' },
    },
  );
  expect(rejectedRefund.status(), await rejectedRefund.text()).toBe(409);
  expect(await rejectedRefund.json()).toMatchObject({
    error: { code: 'PERIOD_CARD_ENTITLEMENT_ALREADY_USED' },
  });
  const periodOrdersAfterRejection = await (
    await page.request.get(
      `/api/institutions/${institution.id}/orders?page=1&pageSize=20&search=${periodOrder.orderNo}`,
    )
  ).json();
  expect(periodOrdersAfterRejection.items[0].status).toBe('completed');
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/period-card-usages/${periodUsage.usage.id}/reverse`,
      {
        headers,
        data: { operationId: randomUUID(), reason: '恢复未使用状态后验收退款' },
      },
    ),
    200,
  );
  const periodRefund = await expectJson(
    await page.request.post(
      `/api/institutions/${institution.id}/orders/${periodOrder.id}/actions/refund`,
      {
        headers,
        data: {
          expectedRevision: periodOrdersAfterRejection.items[0].revision,
          reason: '周期卡使用已冲正，现已线下退款',
        },
      },
    ),
    200,
  );
  expect(periodRefund.status).toBe('refunded');
  const entitlementResponse = await page.request.get(
    `/api/institutions/${institution.id}/period-card-entitlements/${periodOrder.periodCardEntitlementId}`,
  );
  expect(entitlementResponse.status(), await entitlementResponse.text()).toBe(200);
  expect(await entitlementResponse.json()).toMatchObject({
    lifecycleState: 'revoked',
    effectiveStatus: 'revoked',
    usedQuantity: 0,
  });

  await expect(row.getByText('已退款', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '退款' })).toHaveCount(0);
  await page.screenshot({ path: `${screenshots}/refunded-order.png`, fullPage: true });
  expect(errors).toEqual([]);
});
