import { idSchema, student360ResponseSchema } from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

export function createStudent360Api(client: ApiClient) {
  return {
    get(institutionId: string, studentId: string) {
      return client.request({
        path: `/api/institutions/${encodeURIComponent(idSchema.parse(institutionId))}/students/${encodeURIComponent(idSchema.parse(studentId))}/360`,
        schema: student360ResponseSchema,
      });
    },
  };
}
