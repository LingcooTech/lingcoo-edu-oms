import {
  mailDeliveryDetailSchema,
  mailDeliveryPageSchema,
  mailDeliveryQuerySchema,
  mailTemplateListSchema,
  mailTemplateSchema,
  queuedMailSchema,
  resetMailTemplateRequestSchema,
  sendTestMailRequestSchema,
  updateMailTemplateRequestSchema,
  type MailDeliveryQuery,
  type ResetMailTemplateRequest,
  type SendTestMailRequest,
  type UpdateMailTemplateRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: MailDeliveryQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return params.toString();
}

export function createMailApi(client: ApiClient) {
  return {
    listDeliveries(input: Partial<MailDeliveryQuery> = {}) {
      const query = mailDeliveryQuerySchema.parse(input);
      return client.request({
        path: `/api/mail/deliveries?${queryString(query)}`,
        schema: mailDeliveryPageSchema,
      });
    },
    getDelivery(id: string) {
      return client.request({
        path: `/api/mail/deliveries/${encodeURIComponent(id)}`,
        schema: mailDeliveryDetailSchema,
      });
    },
    listTemplates() {
      return client.request({ path: '/api/mail/templates', schema: mailTemplateListSchema });
    },
    getTemplate(key: string) {
      return client.request({
        path: `/api/mail/templates/${encodeURIComponent(key)}`,
        schema: mailTemplateSchema,
      });
    },
    updateTemplate(key: string, input: UpdateMailTemplateRequest) {
      return client.request({
        path: `/api/mail/templates/${encodeURIComponent(key)}`,
        method: 'PUT',
        body: updateMailTemplateRequestSchema.parse(input),
        schema: mailTemplateSchema,
      });
    },
    resetTemplate(key: string, input: ResetMailTemplateRequest) {
      return client.request({
        path: `/api/mail/templates/${encodeURIComponent(key)}`,
        method: 'DELETE',
        body: resetMailTemplateRequestSchema.parse(input),
        schema: mailTemplateSchema,
      });
    },
    sendTest(input: SendTestMailRequest) {
      return client.request({
        path: '/api/mail/actions/test',
        method: 'POST',
        body: sendTestMailRequestSchema.parse(input),
        schema: queuedMailSchema,
      });
    },
  };
}

export type MailApi = ReturnType<typeof createMailApi>;
