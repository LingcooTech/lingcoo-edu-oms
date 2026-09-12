import { createHmac, randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const signingSecret = 'trial-reservation-preview-signing-secret-2026';
const screenshots = 'docs/acceptance/trial-reservation-fee';

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

test('真实数据库：免费试听直接占位，收费试听支付确认且不创建正式学员', async ({ page }) => {
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
    ['payments.mock.app-id', 'trial-reservation-preview-app'],
    ['payments.mock.merchant-id', 'trial-reservation-preview-merchant'],
    ['payments.mock.signing-secret', signingSecret],
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
      data: { name: `试听占位费演示机构 ${suffix}`, type: 'partner' },
    }),
    201,
  );
  const studentsBeforeResponse = await page.request.get(
    `/api/institutions/${institution.id}/students?page=1&pageSize=100`,
  );
  expect(studentsBeforeResponse.status(), await studentsBeforeResponse.text()).toBe(200);
  const studentsBefore = await studentsBeforeResponse.json();

  const start = new Date(Date.now() + 48 * 3_600_000);
  const paidTitle = `收费试听占位验收 ${suffix}`;
  const paidTrial = await expectJson(
    await page.request.post('/api/admissions/trials', {
      headers: mutationHeaders,
      data: {
        institutionId: institution.id,
        title: paidTitle,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
        capacity: 2,
        reservationFeeAmountMinor: 9_900,
        reservationHoldMinutes: 15,
        reservationRefundCutoffHours: 12,
        notes: '支付成功只确认试听名额，不生成正式学员或课时账户。',
      },
    }),
    201,
  );
  const miniCatalogResponse = await page.request.get(
    `/api/mini/admissions/trials?institutionId=${institution.id}&page=1&pageSize=100`,
  );
  expect(miniCatalogResponse.status(), await miniCatalogResponse.text()).toBe(200);
  expect((await miniCatalogResponse.json()).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: paidTrial.id, reservationFeeAmountMinor: 9_900 }),
    ]),
  );

  const idempotencyKey = randomUUID();
  const reservationPayload = {
    guardianName: `试听家长 ${suffix}`,
    phone: `138${suffix}`,
    studentName: `试听学员 ${suffix}`,
    grade: '三年级',
    source: 'wechat-mini',
    provider: 'mock',
  };
  const checkout = await expectJson(
    await page.request.post(`/api/mini/admissions/trials/${paidTrial.id}/reservations`, {
      headers: { ...mutationHeaders, 'idempotency-key': idempotencyKey },
      data: reservationPayload,
    }),
    201,
  );
  expect(checkout.registration).toMatchObject({
    status: 'pending_payment',
    paymentStatus: 'pending',
    amountMinor: 9_900,
    studentNameSnapshot: reservationPayload.studentName,
  });
  expect(checkout.payment.merchantReference).toBe(checkout.registration.orderNo);
  const duplicateCheckout = await expectJson(
    await page.request.post(`/api/mini/admissions/trials/${paidTrial.id}/reservations`, {
      headers: { ...mutationHeaders, 'idempotency-key': idempotencyKey },
      data: reservationPayload,
    }),
    201,
  );
  expect(duplicateCheckout.registration.id).toBe(checkout.registration.id);
  expect(duplicateCheckout.payment.id).toBe(checkout.payment.id);

  const callbackPayload = {
    providerEventId: `trial-${randomUUID()}`,
    providerTransactionId: checkout.payment.transactions[0].providerTransactionId,
    appId: 'trial-reservation-preview-app',
    merchantId: 'trial-reservation-preview-merchant',
    eventType: 'payment.succeeded',
    amountMinor: 9_900,
    currency: 'CNY',
    occurredAt: new Date().toISOString(),
  };
  const signature = createHmac('sha256', signingSecret)
    .update(JSON.stringify(callbackPayload))
    .digest('hex');
  const callback = await page.request.post('/api/payments/providers/mock/callback', {
    headers: { 'x-payment-signature': signature },
    data: callbackPayload,
  });
  expect(callback.status(), await callback.text()).toBe(200);
  const duplicateCallback = await page.request.post('/api/payments/providers/mock/callback', {
    headers: { 'x-payment-signature': signature },
    data: callbackPayload,
  });
  expect(duplicateCallback.status(), await duplicateCallback.text()).toBe(200);
  expect(await duplicateCallback.json()).toMatchObject({ accepted: true, deduplicated: true });

  const confirmedResponse = await page.request.get(
    `/api/mini/admissions/trial-reservations/${checkout.registration.id}`,
  );
  expect(confirmedResponse.status(), await confirmedResponse.text()).toBe(200);
  expect(await confirmedResponse.json()).toMatchObject({
    status: 'booked',
    paymentStatus: 'succeeded',
    amountMinor: 9_900,
  });
  const receiptResponse = await page.request.get(
    `/api/mini/admissions/trial-reservations/${checkout.registration.id}/receipt`,
  );
  expect(receiptResponse.status(), await receiptResponse.text()).toBe(200);
  expect(await receiptResponse.json()).toMatchObject({
    title: '试听占位费收据',
    amountMinor: 9_900,
    registration: { id: checkout.registration.id, paymentStatus: 'succeeded' },
  });
  const directRefund = await page.request.post(
    `/api/payments/intents/${checkout.payment.id}/refunds`,
    {
      headers: mutationHeaders,
      data: { requestKey: randomUUID(), amountMinor: 9_900, reason: '验证专用退款流程保护' },
    },
  );
  expect(directRefund.status(), await directRefund.text()).toBe(409);
  expect(await directRefund.json()).toMatchObject({
    error: { code: 'ADMISSION_RESERVATION_REFUND_WORKFLOW_REQUIRED' },
  });

  const freeTitle = `免费试听占位验收 ${suffix}`;
  const freeTrial = await expectJson(
    await page.request.post('/api/admissions/trials', {
      headers: mutationHeaders,
      data: {
        institutionId: institution.id,
        title: freeTitle,
        startsAt: new Date(start.getTime() + 24 * 3_600_000).toISOString(),
        endsAt: new Date(start.getTime() + 25 * 3_600_000).toISOString(),
        capacity: 1,
        reservationFeeAmountMinor: 0,
      },
    }),
    201,
  );
  const freeCheckout = await expectJson(
    await page.request.post(`/api/mini/admissions/trials/${freeTrial.id}/reservations`, {
      headers: { ...mutationHeaders, 'idempotency-key': randomUUID() },
      data: { ...reservationPayload, studentName: `免费试听学员 ${suffix}` },
    }),
    201,
  );
  expect(freeCheckout).toMatchObject({
    payment: null,
    registration: { status: 'booked', paymentStatus: 'not_required', amountMinor: 0 },
  });

  const studentsAfterResponse = await page.request.get(
    `/api/institutions/${institution.id}/students?page=1&pageSize=100`,
  );
  expect(studentsAfterResponse.status(), await studentsAfterResponse.text()).toBe(200);
  expect((await studentsAfterResponse.json()).total).toBe(studentsBefore.total);

  await page.goto('/admin/admissions/trials');
  await expect(page.getByRole('heading', { name: '招生转化', exact: true })).toBeVisible();
  const paidRow = page.getByRole('row').filter({ hasText: paidTitle });
  await expect(paidRow).toContainText('¥99.00');
  await expect(paidRow).toContainText('15 分钟内完成支付');
  await paidRow.getByRole('button', { name: '报名名单' }).click();
  const modal = page.getByRole('dialog', { name: `${paidTitle} · 报名名单` });
  await expect(modal.getByText(reservationPayload.studentName, { exact: true })).toBeVisible();
  await expect(modal.getByText('已支付', { exact: true })).toBeVisible();
  await expect(modal.getByText(checkout.registration.orderNo, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${screenshots}/paid-reservation-admin.png`, fullPage: true });
  expect(pageErrors).toEqual([]);
});
