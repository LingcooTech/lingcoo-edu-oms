import {
  addLessonSessionStudentsRequestSchema,
  cancelLessonSessionRequestSchema,
  completeLessonSessionRequestSchema,
  consumeLessonSessionStudentRequestSchema,
  consumeLessonSessionStudentsRequestSchema,
  createLessonSessionRequestSchema,
  idSchema,
  lessonSessionBulkConsumptionResultSchema,
  lessonSessionConsumptionResultSchema,
  lessonSessionListQuerySchema,
  lessonSessionPageSchema,
  lessonSessionRosterEntrySchema,
  lessonSessionRosterSchema,
  lessonSessionSchema,
  lessonSessionTeachersSchema,
  lessonSessionWorkPageSchema,
  openLessonSessionRequestSchema,
  recordLessonSessionAttendanceRequestSchema,
  recordLessonSessionAttendancesRequestSchema,
  replaceLessonSessionTeachersRequestSchema,
  reverseLessonSessionConsumptionRequestSchema,
  updateLessonSessionRequestSchema,
  type AddLessonSessionStudentsRequest,
  type CancelLessonSessionRequest,
  type CompleteLessonSessionRequest,
  type ConsumeLessonSessionStudentRequest,
  type ConsumeLessonSessionStudentsRequest,
  type CreateLessonSessionRequest,
  type LessonSessionListQuery,
  type OpenLessonSessionRequest,
  type RecordLessonSessionAttendanceRequest,
  type RecordLessonSessionAttendancesRequest,
  type ReplaceLessonSessionTeachersRequest,
  type ReverseLessonSessionConsumptionRequest,
  type UpdateLessonSessionRequest,
} from '@lingcoo-edu-oms/contracts';
import { z } from 'zod';

import type { ApiClient } from './client.js';

const addStudentsResultSchema = z.object({
  session: lessonSessionSchema,
  roster: lessonSessionRosterSchema,
});

function pathId(value: string): string {
  return encodeURIComponent(idSchema.parse(value));
}

function queryString(input: LessonSessionListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function collectionPath(institutionId: string): string {
  return `/api/institutions/${pathId(institutionId)}/lesson-sessions`;
}

function sessionPath(institutionId: string, sessionId: string): string {
  return `${collectionPath(institutionId)}/${pathId(sessionId)}`;
}

function rosterEntryPath(institutionId: string, sessionId: string, rosterEntryId: string): string {
  return `${sessionPath(institutionId, sessionId)}/roster/${pathId(rosterEntryId)}`;
}

export function createLessonSessionsApi(client: ApiClient) {
  return {
    list(institutionId: string, input: Partial<LessonSessionListQuery> = {}) {
      const query = lessonSessionListQuerySchema.parse(input);
      return client.request({
        path: `${collectionPath(institutionId)}${queryString(query)}`,
        schema: lessonSessionPageSchema,
      });
    },
    workbench(institutionId: string, input: Partial<LessonSessionListQuery> = {}) {
      const query = lessonSessionListQuerySchema.parse(input);
      return client.request({
        path: `/api/institutions/${pathId(institutionId)}/lesson-session-workbench${queryString(query)}`,
        schema: lessonSessionWorkPageSchema,
      });
    },
    get(institutionId: string, sessionId: string) {
      return client.request({
        path: sessionPath(institutionId, sessionId),
        schema: lessonSessionSchema,
      });
    },
    create(institutionId: string, input: CreateLessonSessionRequest) {
      return client.request({
        method: 'POST',
        path: collectionPath(institutionId),
        body: createLessonSessionRequestSchema.parse(input),
        schema: lessonSessionSchema,
      });
    },
    update(institutionId: string, sessionId: string, input: UpdateLessonSessionRequest) {
      return client.request({
        method: 'PATCH',
        path: sessionPath(institutionId, sessionId),
        body: updateLessonSessionRequestSchema.parse(input),
        schema: lessonSessionSchema,
      });
    },
    open(institutionId: string, sessionId: string, input: OpenLessonSessionRequest) {
      return client.request({
        method: 'POST',
        path: `${sessionPath(institutionId, sessionId)}/open`,
        body: openLessonSessionRequestSchema.parse(input),
        schema: lessonSessionSchema,
      });
    },
    complete(institutionId: string, sessionId: string, input: CompleteLessonSessionRequest) {
      return client.request({
        method: 'POST',
        path: `${sessionPath(institutionId, sessionId)}/complete`,
        body: completeLessonSessionRequestSchema.parse(input),
        schema: lessonSessionSchema,
      });
    },
    cancel(institutionId: string, sessionId: string, input: CancelLessonSessionRequest) {
      return client.request({
        method: 'POST',
        path: `${sessionPath(institutionId, sessionId)}/cancel`,
        body: cancelLessonSessionRequestSchema.parse(input),
        schema: lessonSessionSchema,
      });
    },
    listRoster(institutionId: string, sessionId: string) {
      return client.request({
        path: `${sessionPath(institutionId, sessionId)}/roster`,
        schema: lessonSessionRosterSchema,
      });
    },
    listTeachers(institutionId: string, sessionId: string) {
      return client.request({
        path: `${sessionPath(institutionId, sessionId)}/teachers`,
        schema: lessonSessionTeachersSchema,
      });
    },
    replaceTeachers(
      institutionId: string,
      sessionId: string,
      input: ReplaceLessonSessionTeachersRequest,
    ) {
      return client.request({
        method: 'PUT',
        path: `${sessionPath(institutionId, sessionId)}/teachers`,
        body: replaceLessonSessionTeachersRequestSchema.parse(input),
        schema: lessonSessionTeachersSchema,
      });
    },
    addStudents(institutionId: string, sessionId: string, input: AddLessonSessionStudentsRequest) {
      return client.request({
        method: 'POST',
        path: `${sessionPath(institutionId, sessionId)}/roster`,
        body: addLessonSessionStudentsRequestSchema.parse(input),
        schema: addStudentsResultSchema,
      });
    },
    recordAttendance(
      institutionId: string,
      sessionId: string,
      rosterEntryId: string,
      input: RecordLessonSessionAttendanceRequest,
    ) {
      return client.request({
        method: 'PATCH',
        path: `${rosterEntryPath(institutionId, sessionId, rosterEntryId)}/attendance`,
        body: recordLessonSessionAttendanceRequestSchema.parse(input),
        schema: lessonSessionRosterEntrySchema,
      });
    },
    recordAttendances(
      institutionId: string,
      sessionId: string,
      input: RecordLessonSessionAttendancesRequest,
    ) {
      return client.request({
        method: 'PATCH',
        path: `${sessionPath(institutionId, sessionId)}/attendances`,
        body: recordLessonSessionAttendancesRequestSchema.parse(input),
        schema: lessonSessionRosterSchema,
      });
    },
    consume(
      institutionId: string,
      sessionId: string,
      rosterEntryId: string,
      input: ConsumeLessonSessionStudentRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${rosterEntryPath(institutionId, sessionId, rosterEntryId)}/consumption`,
        body: consumeLessonSessionStudentRequestSchema.parse(input),
        schema: lessonSessionConsumptionResultSchema,
      });
    },
    consumeMany(
      institutionId: string,
      sessionId: string,
      input: ConsumeLessonSessionStudentsRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${sessionPath(institutionId, sessionId)}/consumptions`,
        body: consumeLessonSessionStudentsRequestSchema.parse(input),
        schema: lessonSessionBulkConsumptionResultSchema,
      });
    },
    reverseConsumption(
      institutionId: string,
      sessionId: string,
      rosterEntryId: string,
      input: ReverseLessonSessionConsumptionRequest,
    ) {
      return client.request({
        method: 'POST',
        path: `${rosterEntryPath(institutionId, sessionId, rosterEntryId)}/consumption/reversal`,
        body: reverseLessonSessionConsumptionRequestSchema.parse(input),
        schema: lessonSessionConsumptionResultSchema,
      });
    },
  };
}

export type LessonSessionsApi = ReturnType<typeof createLessonSessionsApi>;
