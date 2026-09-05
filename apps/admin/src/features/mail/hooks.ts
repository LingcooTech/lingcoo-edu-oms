import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MailDeliveryQuery,
  ResetMailTemplateRequest,
  SendTestMailRequest,
  UpdateMailTemplateRequest,
} from '@lingcoo-edu-oms/contracts';

import { mailApi } from './api';

export const mailQueryKeys = {
  all: ['mail'] as const,
  deliveries: (query: Partial<MailDeliveryQuery>) => ['mail', 'deliveries', query] as const,
  delivery: (id: string) => ['mail', 'delivery', id] as const,
  templates: ['mail', 'templates'] as const,
};
export function useMailDeliveries(query: Partial<MailDeliveryQuery>) {
  return useQuery({
    queryKey: mailQueryKeys.deliveries(query),
    queryFn: () => mailApi.listDeliveries(query),
  });
}
export function useMailDelivery(id: string | null) {
  return useQuery({
    queryKey: mailQueryKeys.delivery(id ?? 'none'),
    queryFn: () => mailApi.getDelivery(id!),
    enabled: Boolean(id),
  });
}
export function useMailTemplates() {
  return useQuery({ queryKey: mailQueryKeys.templates, queryFn: () => mailApi.listTemplates() });
}
export function useUpdateMailTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: UpdateMailTemplateRequest }) =>
      mailApi.updateTemplate(key, input),
    onSuccess: () => client.invalidateQueries({ queryKey: mailQueryKeys.templates }),
  });
}
export function useResetMailTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: ResetMailTemplateRequest }) =>
      mailApi.resetTemplate(key, input),
    onSuccess: () => client.invalidateQueries({ queryKey: mailQueryKeys.templates }),
  });
}
export function useSendTestMail() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendTestMailRequest) => mailApi.sendTest(input),
    onSuccess: () => client.invalidateQueries({ queryKey: mailQueryKeys.all }),
  });
}
