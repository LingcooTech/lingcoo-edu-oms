import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const screenshots = 'docs/acceptance/academic-workbench';

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

test('后台日历聚合课次并给出点名和消课待办', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await login(page);

  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  const headers = { 'x-csrf-token': (await me.json()).csrfToken as string };
  const suffix = Date.now().toString().slice(-8);
  const institutionsResponse = await page.request.get(
    '/api/institutions?page=1&pageSize=100&status=active',
  );
  expect(institutionsResponse.status(), await institutionsResponse.text()).toBe(200);
  const institution = (await institutionsResponse.json()).items[0] as
    { id: string; name: string } | undefined;
  expect(institution).toBeTruthy();
  const student = await expectJson(
    await page.request.post(`/api/institutions/${institution!.id}/students`, {
      headers,
      data: { fullName: `教务验收学员 ${suffix}` },
    }),
    201,
  );

  const startsAt = new Date(Date.now() + 30 * 60_000);
  const createSession = async (name: string, offsetHours: number) =>
    expectJson(
      await page.request.post(`/api/institutions/${institution!.id}/lesson-sessions`, {
        headers,
        data: {
          institutionId: institution!.id,
          name,
          startsAt: new Date(startsAt.getTime() + offsetHours * 60 * 60_000).toISOString(),
          endsAt: new Date(startsAt.getTime() + (offsetHours + 1) * 60 * 60_000).toISOString(),
          source: 'manual',
          defaultUnits: 1,
        },
      }),
      201,
    );

  const pendingName = `待点名课次 ${suffix}`;
  const pendingSession = await createSession(pendingName, 0);
  const pendingRoster = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${pendingSession.id}/roster`,
      {
        headers,
        data: { expectedRevision: pendingSession.revision, studentIds: [student.id] },
      },
    ),
    201,
  );
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${pendingSession.id}/open`,
      { headers, data: { expectedRevision: pendingRoster.session.revision } },
    ),
    200,
  );

  const consumeName = `待消课课次 ${suffix}`;
  const consumeSession = await createSession(consumeName, 2);
  const consumeRoster = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${consumeSession.id}/roster`,
      {
        headers,
        data: { expectedRevision: consumeSession.revision, studentIds: [student.id] },
      },
    ),
    201,
  );
  const opened = await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${consumeSession.id}/open`,
      { headers, data: { expectedRevision: consumeRoster.session.revision } },
    ),
    200,
  );
  await expectJson(
    await page.request.patch(
      `/api/institutions/${institution!.id}/lesson-sessions/${consumeSession.id}/roster/${consumeRoster.roster.items[0].id}/attendance`,
      {
        headers,
        data: {
          expectedRevision: consumeRoster.roster.items[0].revision,
          attendanceStatus: 'present',
        },
      },
    ),
    200,
  );
  await expectJson(
    await page.request.post(
      `/api/institutions/${institution!.id}/lesson-sessions/${consumeSession.id}/complete`,
      { headers, data: { expectedRevision: opened.revision } },
    ),
    200,
  );

  await page.goto('/admin/academic-workbench');
  await expect(page.getByRole('heading', { name: '教务工作台' })).toBeVisible();
  await expect(page.getByText(pendingName).first()).toBeVisible();
  await expect(page.getByText(consumeName).first()).toBeVisible();
  await expect(page.getByText('待点名').first()).toBeVisible();
  await expect(page.getByText('待消课与异常')).toBeVisible();
  await expect(page.getByText('点名 0/1').first()).toBeVisible();
  await expect(page.getByText('点名 1/1').first()).toBeVisible();
  await page.screenshot({ path: `${screenshots}/desktop.png`, fullPage: true });

  const pendingAgenda = page
    .locator('.academic-agenda-item')
    .filter({ hasText: pendingName })
    .first();
  await pendingAgenda.getByRole('button', { name: '签到消课' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/attendance\\?.*sessionId=${pendingSession.id}`));
  await expect(page.getByText(pendingName).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
