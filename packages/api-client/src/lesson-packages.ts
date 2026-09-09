import {
  createLessonPackageRequestSchema,
  idSchema,
  lessonPackageListQuerySchema,
  lessonPackagePageSchema,
  lessonPackageSchema,
  updateLessonPackageRequestSchema,
  type CreateLessonPackageRequest,
  type LessonPackageListQuery,
  type UpdateLessonPackageRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function queryString(input: LessonPackageListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function collectionPath(institutionId: string): string {
  return `/api/institutions/${pathId(institutionId)}/lesson-packages`;
}

function itemPath(institutionId: string, packageId: string): string {
  return `${collectionPath(institutionId)}/${pathId(packageId)}`;
}

export function createLessonPackagesApi(client: ApiClient) {
  return {
    list(institutionId: string, input: Partial<LessonPackageListQuery> = {}) {
      const query = lessonPackageListQuerySchema.parse(input);
      return client.request({
        path: `${collectionPath(institutionId)}${queryString(query)}`,
        schema: lessonPackagePageSchema,
      });
    },
    get(institutionId: string, packageId: string) {
      return client.request({
        path: itemPath(institutionId, packageId),
        schema: lessonPackageSchema,
      });
    },
    create(institutionId: string, input: CreateLessonPackageRequest) {
      return client.request({
        method: 'POST',
        path: collectionPath(institutionId),
        body: createLessonPackageRequestSchema.parse(input),
        schema: lessonPackageSchema,
      });
    },
    update(institutionId: string, packageId: string, input: UpdateLessonPackageRequest) {
      return client.request({
        method: 'PATCH',
        path: itemPath(institutionId, packageId),
        body: updateLessonPackageRequestSchema.parse(input),
        schema: lessonPackageSchema,
      });
    },
  };
}

export type LessonPackagesApi = ReturnType<typeof createLessonPackagesApi>;
