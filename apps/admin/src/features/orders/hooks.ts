import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateOfflineLessonOrderRequest,
  LessonOrderListQuery,
  LessonOrderProductType,
  CreateLessonOrderRefundRequest,
  ReviewLessonOrderRefundRequest,
  CancelLessonOrderRefundRequest,
  ConfirmOfflineLessonOrderRefundRequest,
  RefundLessonOrderRequest,
} from '@lingcoo-edu-oms/contracts';

import { lessonCommerceApi } from './api';

const orderKeys = {
  all: ['education', 'orders'] as const,
  refunds: (institutionId: string, orderId: string) =>
    ['education', 'orders', institutionId, orderId, 'refunds'] as const,
};

function refreshRefundData(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: orderKeys.all });
  void client.invalidateQueries({ queryKey: ['education', 'lessons'] });
  void client.invalidateQueries({ queryKey: ['education', 'period-cards'] });
  void client.invalidateQueries({ queryKey: ['education', 'people'] });
}

export type LessonOrderFilters = Omit<Partial<LessonOrderListQuery>, 'productType'> & {
  productType?: LessonOrderProductType;
};

export function useLessonOrders(institutionId: string | null, input: LessonOrderFilters) {
  return useQuery({
    queryKey: [...orderKeys.all, institutionId, input],
    queryFn: () => lessonCommerceApi.list(institutionId!, input),
    enabled: Boolean(institutionId),
  });
}

export function useRetryLessonOrderGrant() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { institutionId: string; orderId: string }) =>
      lessonCommerceApi.retryGrant(input.institutionId, input.orderId),
    onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useRefundLessonOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      orderId: string;
      command: RefundLessonOrderRequest;
    }) => lessonCommerceApi.refund(input.institutionId, input.orderId, input.command),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: orderKeys.all });
      void client.invalidateQueries({ queryKey: ['education', 'lessons'] });
      void client.invalidateQueries({ queryKey: ['education', 'period-cards'] });
      void client.invalidateQueries({ queryKey: ['education', 'people'] });
    },
  });
}

export function useLessonOrderRefunds(institutionId: string | null, orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.refunds(institutionId ?? '', orderId ?? ''),
    queryFn: () => lessonCommerceApi.listRefunds(institutionId!, orderId!),
    enabled: Boolean(institutionId && orderId),
  });
}

export function useRequestLessonOrderRefund() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      orderId: string;
      command: CreateLessonOrderRefundRequest;
    }) => lessonCommerceApi.requestRefund(input.institutionId, input.orderId, input.command),
    onSuccess: () => refreshRefundData(client),
  });
}

export function useApproveLessonOrderRefund() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      refundId: string;
      command: ReviewLessonOrderRefundRequest;
    }) => lessonCommerceApi.approveRefund(input.institutionId, input.refundId, input.command),
    onSuccess: () => refreshRefundData(client),
  });
}

export function useRejectLessonOrderRefund() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      refundId: string;
      command: ReviewLessonOrderRefundRequest;
    }) => lessonCommerceApi.rejectRefund(input.institutionId, input.refundId, input.command),
    onSuccess: () => refreshRefundData(client),
  });
}

export function useCancelLessonOrderRefund() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      refundId: string;
      command: CancelLessonOrderRefundRequest;
    }) => lessonCommerceApi.cancelRefund(input.institutionId, input.refundId, input.command),
    onSuccess: () => refreshRefundData(client),
  });
}

export function useConfirmOfflineLessonOrderRefund() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      refundId: string;
      command: ConfirmOfflineLessonOrderRefundRequest;
    }) =>
      lessonCommerceApi.confirmOfflineRefund(input.institutionId, input.refundId, input.command),
    onSuccess: () => refreshRefundData(client),
  });
}

export function useCreateOfflineLessonOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      institutionId: string;
      command: CreateOfflineLessonOrderRequest;
      idempotencyKey: string;
    }) => lessonCommerceApi.createOffline(input.institutionId, input.command, input.idempotencyKey),
    onSuccess: () => client.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useLessonReceipt() {
  return useMutation({
    mutationFn: (input: { institutionId: string; orderId: string }) =>
      lessonCommerceApi.receipt(input.institutionId, input.orderId),
  });
}
