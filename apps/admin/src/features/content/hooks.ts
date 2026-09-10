import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ContentListQuery,
  CreateContentRequest,
  ImportNotionContentRequest,
  UpdateContentRequest,
} from '@lingcoo-edu-oms/contracts';

import { contentApi } from './api';

const contentKeys = {
  all: ['education', 'content'] as const,
  list: (query: Partial<ContentListQuery>) => [...contentKeys.all, 'list', query] as const,
};

export function useContentItems(query: Partial<ContentListQuery>) {
  return useQuery({ queryKey: contentKeys.list(query), queryFn: () => contentApi.list(query) });
}

function invalidateContent(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: contentKeys.all });
}

export function useCreateContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContentRequest) => contentApi.create(input),
    onSuccess: () => invalidateContent(queryClient),
  });
}

export function useUpdateContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContentRequest }) =>
      contentApi.update(id, input),
    onSuccess: () => invalidateContent(queryClient),
  });
}

export function useImportNotionContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportNotionContentRequest) => contentApi.importNotion(input),
    onSuccess: () => invalidateContent(queryClient),
  });
}
