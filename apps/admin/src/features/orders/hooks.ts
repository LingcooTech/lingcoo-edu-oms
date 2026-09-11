import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LessonOrderListQuery } from '@lingcoo-edu-oms/contracts';

import { lessonCommerceApi } from './api';

const orderKeys = { all: ['education', 'orders'] as const };

export function useLessonOrders(
  institutionId: string | null,
  input: Partial<LessonOrderListQuery>,
) {
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
