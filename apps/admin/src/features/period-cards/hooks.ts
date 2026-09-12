import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  periodCardsApi,
  type CreatePeriodCardProductRequest,
  type IssuePeriodCardEntitlementRequest,
  type PeriodCardEntitlementListQuery,
  type PeriodCardProductListQuery,
  type PeriodCardUsageListQuery,
  type ReversePeriodCardUsageRequest,
  type UpdatePeriodCardProductRequest,
} from './api';

export const periodCardKeys = {
  all: ['education', 'period-cards'] as const,
  products: (institutionId: string, query: PeriodCardProductListQuery) =>
    [...periodCardKeys.all, 'products', institutionId, query] as const,
  product: (institutionId: string, productId: string) =>
    [...periodCardKeys.all, 'product', institutionId, productId] as const,
  entitlements: (institutionId: string, query: PeriodCardEntitlementListQuery) =>
    [...periodCardKeys.all, 'entitlements', institutionId, query] as const,
  usages: (institutionId: string, query: PeriodCardUsageListQuery) =>
    [...periodCardKeys.all, 'usages', institutionId, query] as const,
};

export function usePeriodCardProducts(
  institutionId: string | null,
  query: PeriodCardProductListQuery,
) {
  return useQuery({
    queryKey: periodCardKeys.products(institutionId ?? '', query),
    queryFn: () => periodCardsApi.listProducts(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function usePeriodCardProduct(institutionId: string | null, productId: string | null) {
  return useQuery({
    queryKey: periodCardKeys.product(institutionId ?? '', productId ?? ''),
    queryFn: () => periodCardsApi.getProduct(institutionId!, productId!),
    enabled: Boolean(institutionId && productId),
  });
}

export function useCreatePeriodCardProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: CreatePeriodCardProductRequest;
    }) => periodCardsApi.createProduct(institutionId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: periodCardKeys.all }),
  });
}

export function useUpdatePeriodCardProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      productId,
      input,
    }: {
      institutionId: string;
      productId: string;
      input: UpdatePeriodCardProductRequest;
    }) => periodCardsApi.updateProduct(institutionId, productId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: periodCardKeys.all }),
  });
}

export function usePeriodCardEntitlements(
  institutionId: string | null,
  query: PeriodCardEntitlementListQuery,
) {
  return useQuery({
    queryKey: periodCardKeys.entitlements(institutionId ?? '', query),
    queryFn: () => periodCardsApi.listEntitlements(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useIssuePeriodCardEntitlement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      input,
    }: {
      institutionId: string;
      input: IssuePeriodCardEntitlementRequest;
    }) => periodCardsApi.issueEntitlement(institutionId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: periodCardKeys.all }),
  });
}

export function usePeriodCardUsages(institutionId: string | null, query: PeriodCardUsageListQuery) {
  return useQuery({
    queryKey: periodCardKeys.usages(institutionId ?? '', query),
    queryFn: () => periodCardsApi.listUsages(institutionId!, query),
    enabled: Boolean(institutionId),
  });
}

export function useReversePeriodCardUsage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      institutionId,
      usageId,
      input,
    }: {
      institutionId: string;
      usageId: string;
      input: ReversePeriodCardUsageRequest;
    }) => periodCardsApi.reverseUsage(institutionId, usageId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: periodCardKeys.all }),
  });
}
