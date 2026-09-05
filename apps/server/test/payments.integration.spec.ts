import { createHmac } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { validateEnvironment, type AppEnvironment } from '../src/config/environment.js';
import { createDatabase, type DatabaseHandle } from '../src/database/database.js';
import { createAccessControlService } from '../src/modules/access-control/public.js';
import {
  accessPermissions,
  accessRolePermissions,
  accessRoles,
  accessUserRoles,
} from '../src/modules/access-control/infrastructure/persistence/access-control.schema.js';
import { auditEvents } from '../src/modules/audit/infrastructure/persistence/audit.schema.js';
import { createIdentityService } from '../src/modules/identity/public.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from '../src/modules/identity/infrastructure/persistence/identity.schema.js';
import {
  paymentCallbacks,
  paymentIntents,
  paymentProviderTransactions,
  paymentRefunds,
} from '../src/modules/payments/infrastructure/persistence/payments.schema.js';
import { mockPaymentCallbackRequestSchema } from '@lingcoo-edu-oms/contracts';

const suite = process.env.RUN_DATABASE_TESTS === 'true' ? describe : describe.skip;
const signingSecret = 'payment-integration-signing-secret-at-least-32-characters';

function cookies(headers: string | string[] | undefined) {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const joined = values.join(',');
  const session = /test_session=([^;,]+)/.exec(joined)?.[1];
  const csrf = /test_csrf=([^;,]+)/.exec(joined)?.[1];
  if (!session || !csrf) throw new Error('Authentication cookies are missing');
  return { cookie: `test_session=${session}; test_csrf=${csrf}`, csrf };
}

suite('payments PostgreSQL integration', () => {
  let database: DatabaseHandle;
  let environment: AppEnvironment;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let authentication: ReturnType<typeof cookies>;

  beforeAll(async () => {
    environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      APP_NAME: 'Payments Integration',
      AUTH_COOKIE_NAME: 'test_session',
      AUTH_CSRF_COOKIE_NAME: 'test_csrf',
      AUTH_EXPOSE_TEST_TOKENS: 'true',
      APP_PUBLIC_URL: 'http://localhost:5173',
      MAIL_TRANSPORT: 'capture',
      STORAGE_PROVIDER: 'local',
      LOG_LEVEL: 'silent',
      PAYMENTS_MOCK_APP_ID: 'integration-app',
      PAYMENTS_MOCK_MERCHANT_ID: 'integration-merchant',
      PAYMENTS_MOCK_SIGNING_SECRET: signingSecret,
    });
    database = createDatabase(environment.DATABASE_URL);
    await cleanup();
    const identity = createIdentityService({ database, environment });
    const access = createAccessControlService({ database, identity });
    await access.synchronizeSystemAccess();
    const owner = await identity.ensureBootstrapUser(
      'payments-owner@example.com',
      'owner-secure-password',
    );
    await access.assignOwner(owner.id);
    app = await buildApp({ environment, database });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: owner.email, password: 'owner-secure-password' },
    });
    authentication = cookies(login.headers['set-cookie']);
  });

  beforeEach(async () => {
    await clearPayments();
    await database.db.execute(sql`truncate table ${auditEvents}`);
  });

  afterAll(async () => {
    if (!database) return;
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await clearPayments();
    await database.db.delete(accessUserRoles);
    await database.db.delete(accessRolePermissions);
    await database.db.delete(accessRoles);
    await database.db.delete(accessPermissions);
    await database.db.delete(identityActionTokens);
    await database.db.delete(identitySessions);
    await database.db.delete(identityPasswordCredentials);
    await database.db.delete(identityUsers);
  }

  async function clearPayments() {
    await database.db.execute(
      sql`truncate table ${paymentCallbacks}, ${paymentRefunds}, ${paymentProviderTransactions}, ${paymentIntents}`,
    );
  }

  function ownerHeaders() {
    return { cookie: authentication.cookie, 'x-csrf-token': authentication.csrf };
  }
  async function createIntent(reference = `order-${crypto.randomUUID()}`, amountMinor = 10_000) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/payments/intents',
      headers: ownerHeaders(),
      payload: {
        merchantReference: reference,
        amountMinor,
        currency: 'CNY',
        description: `Payment for ${reference}`,
      },
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }
  function signedCallback(transactionId: string, overrides: Record<string, unknown> = {}) {
    const payload = mockPaymentCallbackRequestSchema.parse({
      providerEventId: `event-${crypto.randomUUID()}`,
      providerTransactionId: transactionId,
      appId: 'integration-app',
      merchantId: 'integration-merchant',
      eventType: 'payment.succeeded',
      amountMinor: 10_000,
      currency: 'CNY',
      occurredAt: new Date().toISOString(),
      ...overrides,
    });
    return {
      payload,
      signature: createHmac('sha256', signingSecret).update(JSON.stringify(payload)).digest('hex'),
    };
  }

  it('creates intents idempotently and rejects reference reuse with changed money', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/payments/intents' })).statusCode).toBe(
      401,
    );
    const first = await createIntent('order-stable');
    expect(first).toMatchObject({
      merchantReference: 'order-stable',
      amountMinor: 10_000,
      status: 'pending',
    });
    expect(first.transactions).toHaveLength(1);
    const duplicate = await createIntent('order-stable');
    expect(duplicate.id).toBe(first.id);
    expect(await database.db.select().from(paymentProviderTransactions)).toHaveLength(1);
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/payments/intents',
      headers: ownerHeaders(),
      payload: {
        merchantReference: 'order-stable',
        amountMinor: 11_000,
        currency: 'CNY',
        description: 'Payment for order-stable',
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('PAYMENT_INTENT_REFERENCE_CONFLICT');
  });

  it('verifies, validates, deduplicates, and preserves callback facts', async () => {
    const intent = await createIntent();
    const callback = signedCallback(intent.transactions[0].providerTransactionId);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/payments/providers/mock/callback',
      headers: { 'x-payment-signature': '0'.repeat(64) },
      payload: callback.payload,
    });
    expect(invalid.statusCode).toBe(401);
    expect(await database.db.select().from(paymentCallbacks)).toHaveLength(0);
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/payments/providers/mock/callback',
      headers: { 'x-payment-signature': callback.signature },
      payload: callback.payload,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      accepted: true,
      deduplicated: false,
      status: 'succeeded',
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/payments/providers/mock/callback',
      headers: { 'x-payment-signature': callback.signature },
      payload: callback.payload,
    });
    expect(duplicate.json().deduplicated).toBe(true);
    expect(await database.db.select().from(paymentCallbacks)).toHaveLength(1);
    try {
      await database.db
        .update(paymentCallbacks)
        .set({ eventType: 'payment.failed' })
        .where(eq(paymentCallbacks.providerEventId, callback.payload.providerEventId));
      throw new Error('Expected immutable callback update to fail');
    } catch (error) {
      expect((error as { cause?: { message?: string } }).cause?.message).toContain('immutable');
    }
  });

  it('prevents over-refunds, deduplicates refund requests, and closes unpaid intents', async () => {
    const intent = await createIntent();
    const callback = signedCallback(intent.transactions[0].providerTransactionId);
    await app.inject({
      method: 'POST',
      url: '/api/payments/providers/mock/callback',
      headers: { 'x-payment-signature': callback.signature },
      payload: callback.payload,
    });
    const refund = await app.inject({
      method: 'POST',
      url: `/api/payments/intents/${intent.id}/refunds`,
      headers: ownerHeaders(),
      payload: { requestKey: 'refund-order-partial', amountMinor: 4_000, reason: 'Partial return' },
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json()).toMatchObject({ status: 'succeeded', amountMinor: 4_000 });
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/payments/intents/${intent.id}/refunds`,
      headers: ownerHeaders(),
      payload: { requestKey: 'refund-order-partial', amountMinor: 4_000, reason: 'Partial return' },
    });
    expect(duplicate.json().id).toBe(refund.json().id);
    const over = await app.inject({
      method: 'POST',
      url: `/api/payments/intents/${intent.id}/refunds`,
      headers: ownerHeaders(),
      payload: { requestKey: 'refund-order-too-much', amountMinor: 7_000, reason: 'Too much' },
    });
    expect(over.statusCode).toBe(409);
    expect(over.json().error.code).toBe('PAYMENT_REFUND_EXCEEDS_AVAILABLE');

    const unpaid = await createIntent('order-close', 2_000);
    const closed = await app.inject({
      method: 'POST',
      url: `/api/payments/intents/${unpaid.id}/actions/close`,
      headers: ownerHeaders(),
    });
    expect(closed.json().status).toBe('closed');
    expect(
      (await database.db.select().from(auditEvents)).some(
        (event) => event.action === 'payment.refund.succeeded',
      ),
    ).toBe(true);
  });
});
