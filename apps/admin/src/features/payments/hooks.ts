import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePaymentIntentRequest,
  CreatePaymentRefundRequest,
  PaymentCallbackQuery,
  PaymentIntentQuery,
  PaymentRefundQuery,
  PaymentTransactionQuery,
} from '@lingcoo-edu-oms/contracts';

import { paymentsApi } from './api';

const all = ['payments'] as const;
export function usePaymentIntents(query: Partial<PaymentIntentQuery>) {
  return useQuery({
    queryKey: [...all, 'intents', query],
    queryFn: () => paymentsApi.listIntents(query),
  });
}
export function usePaymentIntent(id: string | null) {
  return useQuery({
    queryKey: [...all, 'intent', id],
    queryFn: () => paymentsApi.getIntent(id!),
    enabled: Boolean(id),
  });
}
export function usePaymentTransactions(query: Partial<PaymentTransactionQuery>) {
  return useQuery({
    queryKey: [...all, 'transactions', query],
    queryFn: () => paymentsApi.listTransactions(query),
  });
}
export function usePaymentRefunds(query: Partial<PaymentRefundQuery>) {
  return useQuery({
    queryKey: [...all, 'refunds', query],
    queryFn: () => paymentsApi.listRefunds(query),
  });
}
export function usePaymentCallbacks(query: Partial<PaymentCallbackQuery>) {
  return useQuery({
    queryKey: [...all, 'callbacks', query],
    queryFn: () => paymentsApi.listCallbacks(query),
  });
}
function invalidatingMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => client.invalidateQueries({ queryKey: all }) });
}
export function useCreatePaymentIntent() {
  return invalidatingMutation((input: CreatePaymentIntentRequest) =>
    paymentsApi.createIntent(input),
  );
}
export function useClosePaymentIntent() {
  return invalidatingMutation((id: string) => paymentsApi.close(id));
}
export function useReconcilePaymentIntent() {
  return invalidatingMutation((id: string) => paymentsApi.reconcile(id));
}
export function useCreatePaymentRefund() {
  return invalidatingMutation((input: { id: string; request: CreatePaymentRefundRequest }) =>
    paymentsApi.refund(input.id, input.request),
  );
}
