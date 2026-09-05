import {
  createPaymentIntentRequestSchema,
  createPaymentRefundRequestSchema,
  paymentCallbackPageSchema,
  paymentCallbackQuerySchema,
  paymentIntentDetailSchema,
  paymentIntentPageSchema,
  paymentIntentQuerySchema,
  paymentRefundPageSchema,
  paymentRefundQuerySchema,
  paymentRefundSchema,
  paymentTransactionPageSchema,
  paymentTransactionQuerySchema,
  type CreatePaymentIntentRequest,
  type CreatePaymentRefundRequest,
  type PaymentCallbackQuery,
  type PaymentIntentQuery,
  type PaymentRefundQuery,
  type PaymentTransactionQuery,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createPaymentsApi(client: ApiClient) {
  return {
    listIntents(input: Partial<PaymentIntentQuery> = {}) {
      const query = paymentIntentQuerySchema.parse(input);
      return client.request({
        path: `/api/payments/intents?${queryString(query)}`,
        schema: paymentIntentPageSchema,
      });
    },
    getIntent(id: string) {
      return client.request({
        path: `/api/payments/intents/${encodeURIComponent(id)}`,
        schema: paymentIntentDetailSchema,
      });
    },
    createIntent(input: CreatePaymentIntentRequest) {
      return client.request({
        path: '/api/payments/intents',
        method: 'POST',
        body: createPaymentIntentRequestSchema.parse(input),
        schema: paymentIntentDetailSchema,
      });
    },
    close(id: string) {
      return client.request({
        path: `/api/payments/intents/${encodeURIComponent(id)}/actions/close`,
        method: 'POST',
        schema: paymentIntentDetailSchema,
      });
    },
    reconcile(id: string) {
      return client.request({
        path: `/api/payments/intents/${encodeURIComponent(id)}/actions/reconcile`,
        method: 'POST',
        schema: paymentIntentDetailSchema,
      });
    },
    refund(id: string, input: CreatePaymentRefundRequest) {
      return client.request({
        path: `/api/payments/intents/${encodeURIComponent(id)}/refunds`,
        method: 'POST',
        body: createPaymentRefundRequestSchema.parse(input),
        schema: paymentRefundSchema,
      });
    },
    listTransactions(input: Partial<PaymentTransactionQuery> = {}) {
      const query = paymentTransactionQuerySchema.parse(input);
      return client.request({
        path: `/api/payments/transactions?${queryString(query)}`,
        schema: paymentTransactionPageSchema,
      });
    },
    listRefunds(input: Partial<PaymentRefundQuery> = {}) {
      const query = paymentRefundQuerySchema.parse(input);
      return client.request({
        path: `/api/payments/refunds?${queryString(query)}`,
        schema: paymentRefundPageSchema,
      });
    },
    listCallbacks(input: Partial<PaymentCallbackQuery> = {}) {
      const query = paymentCallbackQuerySchema.parse(input);
      return client.request({
        path: `/api/payments/callbacks?${queryString(query)}`,
        schema: paymentCallbackPageSchema,
      });
    },
  };
}

export type PaymentsApi = ReturnType<typeof createPaymentsApi>;
