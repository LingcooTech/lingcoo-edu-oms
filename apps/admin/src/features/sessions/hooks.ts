import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddLessonSessionStudentsRequest,
  CancelLessonSessionRequest,
  CompleteLessonSessionRequest,
  ConsumeLessonSessionStudentRequest,
  ConsumeLessonSessionStudentsRequest,
  CreateLessonSessionRequest,
  LessonSessionListQuery,
  OpenLessonSessionRequest,
  RecordLessonSessionAttendanceRequest,
  ReplaceLessonSessionTeachersRequest,
  ReverseLessonSessionConsumptionRequest,
  UpdateLessonSessionRequest,
} from '@lingcoo-edu-oms/contracts';

import { lessonSessionsApi } from './api';
import { listActivePeriodCardEntitlements } from './period-card-api';

export const lessonSessionKeys = {
  all: ['education', 'lesson-sessions'] as const,
  list: (institutionId: string, query: Partial<LessonSessionListQuery>) =>
    [...lessonSessionKeys.all, 'list', institutionId, query] as const,
  detail: (institutionId: string, sessionId: string) =>
    [...lessonSessionKeys.all, 'detail', institutionId, sessionId] as const,
  roster: (institutionId: string, sessionId: string) =>
    [...lessonSessionKeys.all, 'roster', institutionId, sessionId] as const,
  teachers: (institutionId: string, sessionId: string) =>
    [...lessonSessionKeys.all, 'teachers', institutionId, sessionId] as const,
  workbench: (institutionId: string, query: Partial<LessonSessionListQuery>) =>
    [...lessonSessionKeys.all, 'workbench', institutionId, query] as const,
  periodCardEntitlements: (institutionId: string, studentId: string) =>
    [...lessonSessionKeys.all, 'period-card-entitlements', institutionId, studentId] as const,
};

function useRefreshLessonSessions() {
  const queryClient = useQueryClient();
  return (institutionId: string, sessionId?: string) => {
    void queryClient.invalidateQueries({ queryKey: lessonSessionKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['education', 'lessons'] });
    if (sessionId) {
      void queryClient.invalidateQueries({
        queryKey: lessonSessionKeys.detail(institutionId, sessionId),
      });
      void queryClient.invalidateQueries({
        queryKey: lessonSessionKeys.roster(institutionId, sessionId),
      });
      void queryClient.invalidateQueries({
        queryKey: lessonSessionKeys.teachers(institutionId, sessionId),
      });
    }
  };
}

export function useLessonSessions(
  institutionId: string | null,
  query: Partial<LessonSessionListQuery>,
) {
  return useQuery({
    queryKey: lessonSessionKeys.list(institutionId ?? '', query),
    queryFn: () => lessonSessionsApi.list(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useLessonSession(institutionId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: lessonSessionKeys.detail(institutionId ?? '', sessionId ?? ''),
    queryFn: () => lessonSessionsApi.get(institutionId!, sessionId!),
    enabled: Boolean(institutionId && sessionId),
  });
}

export function useLessonSessionRoster(
  institutionId: string | null,
  sessionId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: lessonSessionKeys.roster(institutionId ?? '', sessionId ?? ''),
    queryFn: () => lessonSessionsApi.listRoster(institutionId!, sessionId!),
    enabled: enabled && Boolean(institutionId && sessionId),
  });
}

export function useLessonSessionTeachers(
  institutionId: string | null,
  sessionId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: lessonSessionKeys.teachers(institutionId ?? '', sessionId ?? ''),
    queryFn: () => lessonSessionsApi.listTeachers(institutionId!, sessionId!),
    enabled: enabled && Boolean(institutionId && sessionId),
  });
}

export function useReplaceLessonSessionTeachers() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: ReplaceLessonSessionTeachersRequest;
    }) => lessonSessionsApi.replaceTeachers(institutionId, sessionId, input),
    onSuccess: (result) => refresh(result.session.institutionId, result.session.id),
  });
}

export function useCreateLessonSession() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateLessonSessionRequest;
    }) => lessonSessionsApi.create(institutionId, input),
    onSuccess: (session) => refresh(session.institutionId, session.id),
  });
}

export function useUpdateLessonSession() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: UpdateLessonSessionRequest;
    }) => lessonSessionsApi.update(institutionId, sessionId, input),
    onSuccess: (session) => refresh(session.institutionId, session.id),
  });
}

export function useOpenLessonSession() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: OpenLessonSessionRequest;
    }) => lessonSessionsApi.open(institutionId, sessionId, input),
    onSuccess: (session) => refresh(session.institutionId, session.id),
  });
}

export function useCompleteLessonSession() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: CompleteLessonSessionRequest;
    }) => lessonSessionsApi.complete(institutionId, sessionId, input),
    onSuccess: (session) => refresh(session.institutionId, session.id),
  });
}

export function useCancelLessonSession() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: CancelLessonSessionRequest;
    }) => lessonSessionsApi.cancel(institutionId, sessionId, input),
    onSuccess: (session) => refresh(session.institutionId, session.id),
  });
}

export function useAddLessonSessionStudents() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: AddLessonSessionStudentsRequest;
    }) => lessonSessionsApi.addStudents(institutionId, sessionId, input),
    onSuccess: (result) => refresh(result.session.institutionId, result.session.id),
  });
}

export function useRecordLessonSessionAttendance() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      rosterEntryId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      rosterEntryId: string;
      input: RecordLessonSessionAttendanceRequest;
    }) => lessonSessionsApi.recordAttendance(institutionId, sessionId, rosterEntryId, input),
    onSuccess: (entry) => refresh(entry.institutionId, entry.lessonSessionId),
  });
}

export function useConsumeLessonSessionStudent() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      rosterEntryId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      rosterEntryId: string;
      input: ConsumeLessonSessionStudentRequest;
    }) => lessonSessionsApi.consume(institutionId, sessionId, rosterEntryId, input),
    onSuccess: (result) =>
      refresh(result.rosterEntry.institutionId, result.rosterEntry.lessonSessionId),
  });
}

export function useConsumeLessonSessionStudents() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      input: ConsumeLessonSessionStudentsRequest;
    }) => lessonSessionsApi.consumeMany(institutionId, sessionId, input),
    onSuccess: (_result, variables) => refresh(variables.institutionId, variables.sessionId),
  });
}

export function useActivePeriodCardEntitlements(
  institutionId: string | null,
  studentId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: periodCardEntitlementsKey(institutionId ?? '', studentId ?? ''),
    queryFn: () =>
      listActivePeriodCardEntitlements(institutionId!, {
        studentId: studentId!,
        status: 'active',
        page: 1,
        pageSize: 100,
      }),
    enabled: enabled && Boolean(institutionId && studentId),
  });
}

function periodCardEntitlementsKey(institutionId: string, studentId: string) {
  return lessonSessionKeys.periodCardEntitlements(institutionId, studentId);
}

export function useReverseLessonSessionConsumption() {
  const refresh = useRefreshLessonSessions();
  return useMutation({
    mutationFn: ({
      institutionId,
      sessionId,
      rosterEntryId,
      input,
    }: {
      institutionId: string;
      sessionId: string;
      rosterEntryId: string;
      input: ReverseLessonSessionConsumptionRequest;
    }) => lessonSessionsApi.reverseConsumption(institutionId, sessionId, rosterEntryId, input),
    onSuccess: (result) =>
      refresh(result.rosterEntry.institutionId, result.rosterEntry.lessonSessionId),
  });
}
