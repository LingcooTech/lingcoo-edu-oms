import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AddGroupMatchingEnrollmentRequest,
  ConfirmGroupMatchingFormationRequest,
  CreateGroupMatchingCampaignRequest,
  GroupMatchingCampaignListQuery,
  RecordGroupMatchingDepositRequest,
  RecordGroupMatchingDepositRefundRequest,
  WithdrawGroupMatchingEnrollmentRequest,
} from './api';
import { groupMatchingApi } from './api';
import { lessonCommerceApi } from '../orders/api';

export const groupMatchingKeys = {
  all: ['education', 'group-matching'] as const,
  list: (institutionId: string, query: Partial<GroupMatchingCampaignListQuery>) =>
    [...groupMatchingKeys.all, 'list', institutionId, query] as const,
  detail: (institutionId: string, campaignId: string) =>
    [...groupMatchingKeys.all, 'detail', institutionId, campaignId] as const,
};

function refresh(client: ReturnType<typeof useQueryClient>) {
  return client.invalidateQueries({ queryKey: groupMatchingKeys.all });
}

export function useGroupMatchingCampaigns(
  institutionId: string | null,
  query: Partial<GroupMatchingCampaignListQuery> = {},
) {
  return useQuery({
    queryKey: groupMatchingKeys.list(institutionId ?? '', query),
    queryFn: () => groupMatchingApi.list(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useGroupMatchingCampaign(institutionId: string | null, campaignId: string | null) {
  return useQuery({
    queryKey: groupMatchingKeys.detail(institutionId ?? '', campaignId ?? ''),
    queryFn: () => groupMatchingApi.get(institutionId!, campaignId!),
    enabled: Boolean(institutionId && campaignId),
  });
}

export function useCreateGroupMatchingCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreateGroupMatchingCampaignRequest;
    }) => groupMatchingApi.create(institutionId, input),
    onSuccess: () => refresh(client),
  });
}

export function usePublishGroupMatchingCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      expectedRevision,
    }: {
      institutionId: string;
      campaignId: string;
      expectedRevision: number;
    }) => groupMatchingApi.publish(institutionId, campaignId, { expectedRevision }),
    onSuccess: () => refresh(client),
  });
}

export function useAddGroupMatchingEnrollment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      input,
    }: {
      institutionId: string;
      campaignId: string;
      input: AddGroupMatchingEnrollmentRequest;
    }) => groupMatchingApi.addEnrollment(institutionId, campaignId, input),
    onSuccess: () => refresh(client),
  });
}

export function useRecordGroupMatchingDeposit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      enrollmentId,
      input,
    }: {
      institutionId: string;
      campaignId: string;
      enrollmentId: string;
      input: RecordGroupMatchingDepositRequest;
    }) => groupMatchingApi.recordDeposit(institutionId, campaignId, enrollmentId, input),
    onSuccess: () => refresh(client),
  });
}

export function useRecordGroupMatchingDepositRefund() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      enrollmentId,
      input,
      idempotencyKey,
    }: {
      institutionId: string;
      campaignId: string;
      enrollmentId: string;
      input: RecordGroupMatchingDepositRefundRequest;
      idempotencyKey: string;
    }) =>
      groupMatchingApi.recordDepositRefund(
        institutionId,
        campaignId,
        enrollmentId,
        input,
        idempotencyKey,
      ),
    onSuccess: () => refresh(client),
  });
}

export function useWithdrawGroupMatchingEnrollment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      enrollmentId,
      input,
      idempotencyKey,
    }: {
      institutionId: string;
      campaignId: string;
      enrollmentId: string;
      input: WithdrawGroupMatchingEnrollmentRequest;
      idempotencyKey: string;
    }) =>
      groupMatchingApi.withdrawEnrollment(
        institutionId,
        campaignId,
        enrollmentId,
        input,
        idempotencyKey,
      ),
    onSuccess: () => refresh(client),
  });
}

export function useCancelGroupMatchingCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      expectedRevision,
      reason,
    }: {
      institutionId: string;
      campaignId: string;
      expectedRevision: number;
      reason: string;
    }) => groupMatchingApi.cancel(institutionId, campaignId, { expectedRevision, reason }),
    onSuccess: () => refresh(client),
  });
}

export function useConfirmGroupMatchingFormation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      campaignId,
      input,
    }: {
      institutionId: string;
      campaignId: string;
      input: ConfirmGroupMatchingFormationRequest;
    }) => groupMatchingApi.confirmFormation(institutionId, campaignId, input),
    onSuccess: () => refresh(client),
  });
}

export function useRecordGroupOfflineSettlement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      orderId,
      expectedRevision,
      paymentMethod,
      paidAt,
      paymentReference,
      paymentNote,
      paidAmountMinor,
    }: {
      institutionId: string;
      orderId: string;
      expectedRevision: number;
      paymentMethod: 'cash' | 'bank_transfer' | 'wechat_transfer' | 'other';
      paidAt: string;
      paymentReference: string | null;
      paymentNote: string | null;
      paidAmountMinor: number;
    }) =>
      lessonCommerceApi.recordGroupOfflineSettlement(institutionId, orderId, {
        expectedRevision,
        paymentMethod,
        paidAt,
        paymentReference,
        paymentNote,
        paidAmountMinor,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: groupMatchingKeys.all });
      void client.invalidateQueries({ queryKey: ['education', 'orders'] });
    },
  });
}
