import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssetQuery, UpdateAssetRequest } from '@lingcoo-edu-oms/contracts';

import { storageApi } from './api';

export const storageQueryKeys = {
  all: ['storage-assets'] as const,
  list: (query: Partial<AssetQuery>) => ['storage-assets', 'list', query] as const,
  detail: (id: string) => ['storage-assets', 'detail', id] as const,
};

export function useAssets(query: Partial<AssetQuery>) {
  return useQuery({
    queryKey: storageQueryKeys.list(query),
    queryFn: () => storageApi.list(query),
  });
}

export function useAsset(id?: string) {
  return useQuery({
    queryKey: storageQueryKeys.detail(id ?? ''),
    queryFn: () => storageApi.get(id!),
    enabled: Boolean(id),
  });
}

function useRefreshAssets() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: storageQueryKeys.all });
}

export function useUploadAsset() {
  const refresh = useRefreshAssets();
  return useMutation({ mutationFn: (file: File) => storageApi.upload(file), onSuccess: refresh });
}

export function useReplaceAsset() {
  const refresh = useRefreshAssets();
  return useMutation({
    mutationFn: ({ id, revision, file }: { id: string; revision: number; file: File }) =>
      storageApi.replace(id, revision, file),
    onSuccess: refresh,
  });
}

export function useUpdateAsset() {
  const refresh = useRefreshAssets();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssetRequest }) =>
      storageApi.update(id, input),
    onSuccess: refresh,
  });
}

export function useDeleteAsset() {
  const refresh = useRefreshAssets();
  return useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: number }) =>
      storageApi.delete(id, revision),
    onSuccess: refresh,
  });
}
