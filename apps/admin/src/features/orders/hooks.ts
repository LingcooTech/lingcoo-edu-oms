import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateOfflineLessonOrderRequest,
  LessonOrderListQuery,
  LessonOrderProductType,
  RefundLessonOrderRequest,
} from '@lingcoo-edu-oms/contracts';

import { lessonCommerceApi } from './api';

const orderKeys = { all: ['education', 'orders'] as const };

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
