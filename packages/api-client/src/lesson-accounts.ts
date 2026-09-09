import {
  adjustLessonUnitsRequestSchema,
  adjustLessonUnitsResultSchema,
  clawbackLessonUnitsRequestSchema,
  clawbackLessonUnitsResultSchema,
  grantLessonUnitsRequestSchema,
  grantLessonUnitsResultSchema,
  idSchema,
  lessonAccountMutationHeadersSchema,
  lessonAccountSchema,
  lessonBatchListQuerySchema,
  lessonBatchPageSchema,
  lessonMovementListQuerySchema,
  lessonMovementPageSchema,
  reverseLessonGrantRequestSchema,
  reverseLessonGrantResultSchema,
  type AdjustLessonUnitsRequest,
  type ClawbackLessonUnitsRequest,
  type GrantLessonUnitsRequest,
  type LessonBatchListQuery,
  type LessonMovementListQuery,
  type ReverseLessonGrantRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

export interface LessonAccountMutationOptions {
  /** Use 0 when the caller expects the account to be created by the grant. */
  expectedAccountRevision: number;
  idempotencyKey: string;
}

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function studentPath(institutionId: string, studentId: string): string {
  return `/api/institutions/${pathId(institutionId)}/students/${pathId(studentId)}`;
}

function queryString(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function mutationHeaders(options: LessonAccountMutationOptions): Record<string, string> {
  const parsed = lessonAccountMutationHeadersSchema.parse({
    'idempotency-key': options.idempotencyKey,
    'x-expected-account-revision': options.expectedAccountRevision,
  });
  return {
    'idempotency-key': parsed['idempotency-key'],
    'x-expected-account-revision': String(parsed['x-expected-account-revision']),
  };
}

export function createLessonAccountsApi(client: ApiClient) {
  return {
    get(institutionId: string, studentId: string) {
      return client.request({
        path: `${studentPath(institutionId, studentId)}/lesson-account`,
        schema: lessonAccountSchema.nullable(),
      });
    },
    listBatches(
      institutionId: string,
      studentId: string,
      input: Partial<LessonBatchListQuery> = {},
    ) {
      const query = lessonBatchListQuerySchema.parse(input);
      return client.request({
        path: `${studentPath(institutionId, studentId)}/lesson-account/batches${queryString(query)}`,
        schema: lessonBatchPageSchema,
      });
    },
    listMovements(
      institutionId: string,
      studentId: string,
      input: Partial<LessonMovementListQuery> = {},
    ) {
      const query = lessonMovementListQuerySchema.parse(input);
      return client.request({
        path: `${studentPath(institutionId, studentId)}/lesson-account/movements${queryString(query)}`,
        schema: lessonMovementPageSchema,
      });
    },
    grant(
      institutionId: string,
      studentId: string,
      input: GrantLessonUnitsRequest,
      options: LessonAccountMutationOptions,
    ) {
      return client.request({
        method: 'POST',
        path: `${studentPath(institutionId, studentId)}/lesson-grants`,
        headers: mutationHeaders(options),
        body: grantLessonUnitsRequestSchema.parse(input),
        schema: grantLessonUnitsResultSchema,
      });
    },
    adjust(
      institutionId: string,
      studentId: string,
      input: AdjustLessonUnitsRequest,
      options: LessonAccountMutationOptions,
    ) {
      return client.request({
        method: 'POST',
        path: `${studentPath(institutionId, studentId)}/lesson-adjustments`,
        headers: mutationHeaders(options),
        body: adjustLessonUnitsRequestSchema.parse(input),
        schema: adjustLessonUnitsResultSchema,
      });
    },
    clawback(
      institutionId: string,
      studentId: string,
      batchId: string,
      input: ClawbackLessonUnitsRequest,
      options: LessonAccountMutationOptions,
    ) {
      return client.request({
        method: 'POST',
        path: `${studentPath(institutionId, studentId)}/lesson-batches/${pathId(batchId)}/clawbacks`,
        headers: mutationHeaders(options),
        body: clawbackLessonUnitsRequestSchema.parse(input),
        schema: clawbackLessonUnitsResultSchema,
      });
    },
    reverseGrant(
      institutionId: string,
      studentId: string,
      batchId: string,
      input: ReverseLessonGrantRequest,
      options: LessonAccountMutationOptions,
    ) {
      return client.request({
        method: 'POST',
        path: `${studentPath(institutionId, studentId)}/lesson-batches/${pathId(batchId)}/reversal`,
        headers: mutationHeaders(options),
        body: reverseLessonGrantRequestSchema.parse(input),
        schema: reverseLessonGrantResultSchema,
      });
    },
  };
}

export type LessonAccountsApi = ReturnType<typeof createLessonAccountsApi>;
