import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdjustLessonUnitsRequest,
  ClawbackLessonUnitsRequest,
  CreateLessonPackageRequest,
  GrantLessonUnitsRequest,
  LessonBatchListQuery,
  LessonMovementListQuery,
  LessonPackageListQuery,
  ReverseLessonGrantRequest,
  UpdateLessonPackageRequest,
} from '@lingcoo-edu-oms/contracts';

import { lessonAccountsApi, lessonPackagesApi } from './api';

const lessonKeys = {
  all: ['education', 'lessons'] as const,
  packages: (institutionId: string, query: Partial<LessonPackageListQuery>) =>
    [...lessonKeys.all, 'packages', institutionId, query] as const,
  account: (institutionId: string, studentId: string) =>
    [...lessonKeys.all, 'account', institutionId, studentId] as const,
  batches: (institutionId: string, studentId: string, query: Partial<LessonBatchListQuery>) =>
    [...lessonKeys.account(institutionId, studentId), 'batches', query] as const,
  movements: (institutionId: string, studentId: string, query: Partial<LessonMovementListQuery>) =>
    [...lessonKeys.account(institutionId, studentId), 'movements', query] as const,
};

export function useLessonPackages(
  institutionId: string | null,
  query: Partial<LessonPackageListQuery>,
) {
  return useQuery({
    queryKey: lessonKeys.packages(institutionId ?? '', query),
    queryFn: () => lessonPackagesApi.list(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useCreateLessonPackage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateLessonPackageRequest;
    }) => lessonPackagesApi.create(institutionId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: lessonKeys.all }),
  });
}

export function useUpdateLessonPackage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      packageId,
      input,
    }: {
      institutionId: string;
      packageId: string;
      input: UpdateLessonPackageRequest;
    }) => lessonPackagesApi.update(institutionId, packageId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: lessonKeys.all }),
  });
}

export function useLessonAccount(institutionId: string | null, studentId: string | null) {
  return useQuery({
    queryKey: lessonKeys.account(institutionId ?? '', studentId ?? ''),
    queryFn: () => lessonAccountsApi.get(institutionId!, studentId!),
    enabled: Boolean(institutionId && studentId),
  });
}

export function useLessonBatches(
  institutionId: string | null,
  studentId: string | null,
  query: Partial<LessonBatchListQuery>,
) {
  return useQuery({
    queryKey: lessonKeys.batches(institutionId ?? '', studentId ?? '', query),
    queryFn: () => lessonAccountsApi.listBatches(institutionId!, studentId!, query),
    enabled: Boolean(institutionId && studentId),
  });
}

export function useLessonMovements(
  institutionId: string | null,
  studentId: string | null,
  query: Partial<LessonMovementListQuery>,
) {
  return useQuery({
    queryKey: lessonKeys.movements(institutionId ?? '', studentId ?? '', query),
    queryFn: () => lessonAccountsApi.listMovements(institutionId!, studentId!, query),
    enabled: Boolean(institutionId && studentId),
  });
}

type MutationTarget = {
  institutionId: string;
  studentId: string;
  expectedAccountRevision: number;
  idempotencyKey: string;
};

function options(input: MutationTarget) {
  return {
    expectedAccountRevision: input.expectedAccountRevision,
    idempotencyKey: input.idempotencyKey,
  };
}

export function useGrantLessonUnits() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MutationTarget & { command: GrantLessonUnitsRequest }) =>
      lessonAccountsApi.grant(input.institutionId, input.studentId, input.command, options(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: lessonKeys.all }),
  });
}

export function useAdjustLessonUnits() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MutationTarget & { command: AdjustLessonUnitsRequest }) =>
      lessonAccountsApi.adjust(input.institutionId, input.studentId, input.command, options(input)),
    onSuccess: () => client.invalidateQueries({ queryKey: lessonKeys.all }),
  });
}

export function useClawbackLessonUnits() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      input: MutationTarget & { batchId: string; command: ClawbackLessonUnitsRequest },
    ) =>
      lessonAccountsApi.clawback(
        input.institutionId,
        input.studentId,
        input.batchId,
        input.command,
        options(input),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: lessonKeys.all }),
  });
}

export function useReverseLessonGrant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MutationTarget & { batchId: string; command: ReverseLessonGrantRequest }) =>
      lessonAccountsApi.reverseGrant(
        input.institutionId,
        input.studentId,
        input.batchId,
        input.command,
        options(input),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: lessonKeys.all }),
  });
}
