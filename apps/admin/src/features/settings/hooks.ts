import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClearSettingRequest, SaveSettingRequest } from '@lingcoo-edu-oms/contracts';

import { settingsApi } from './api';

export const settingsQueryKeys = { list: ['settings'] as const };

export function useSettings() {
  return useQuery({ queryKey: settingsQueryKeys.list, queryFn: () => settingsApi.list() });
}

export function useSaveSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: SaveSettingRequest }) =>
      settingsApi.save(key, input),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsQueryKeys.list }),
    onError: () => client.invalidateQueries({ queryKey: settingsQueryKeys.list }),
  });
}

export function useClearSetting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, input }: { key: string; input: ClearSettingRequest }) =>
      settingsApi.clear(key, input),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsQueryKeys.list }),
    onError: () => client.invalidateQueries({ queryKey: settingsQueryKeys.list }),
  });
}

export function useTestSettingConnection() {
  return useMutation({ mutationFn: (key: string) => settingsApi.testConnection(key) });
}

export function useRotateSettingSecrets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => settingsApi.rotateSecrets(),
    onSuccess: () => client.invalidateQueries({ queryKey: settingsQueryKeys.list }),
  });
}
