import {
  jobDetailSchema,
  jobPageSchema,
  jobQuerySchema,
  type JobQuery,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function queryString(input: JobQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function createJobsApi(client: ApiClient) {
  return {
    list(input: Partial<JobQuery> = {}) {
      const query = jobQuerySchema.parse(input);
      return client.request({ path: `/api/jobs?${queryString(query)}`, schema: jobPageSchema });
    },
    get(id: string) {
      return client.request({
        path: `/api/jobs/${encodeURIComponent(id)}`,
        schema: jobDetailSchema,
      });
    },
    retry(id: string) {
      return client.request({
        path: `/api/jobs/${encodeURIComponent(id)}/actions/retry`,
        method: 'POST',
        schema: jobDetailSchema,
      });
    },
    cancel(id: string) {
      return client.request({
        path: `/api/jobs/${encodeURIComponent(id)}/actions/cancel`,
        method: 'POST',
        schema: jobDetailSchema,
      });
    },
  };
}

export type JobsApi = ReturnType<typeof createJobsApi>;
