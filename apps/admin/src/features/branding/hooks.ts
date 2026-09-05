import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateBrandingRequest } from '@lingcoo-edu-oms/contracts';

import { brandingApi } from './api';

export const brandingQueryKeys = {
  all: ['branding'] as const,
  public: ['branding', 'public'] as const,
  admin: ['branding', 'admin'] as const,
};

export function usePublicBranding() {
  return useQuery({
    queryKey: brandingQueryKeys.public,
    queryFn: () => brandingApi.getPublic(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useBrandingConfiguration() {
  return useQuery({ queryKey: brandingQueryKeys.admin, queryFn: () => brandingApi.get() });
}

export function useUpdateBranding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBrandingRequest) => brandingApi.update(input),
    onSuccess: async (configuration) => {
      client.setQueryData(brandingQueryKeys.public, {
        appName: configuration.appName,
        primaryColor: configuration.primaryColor,
        loginTitle: configuration.loginTitle,
        loginSubtitle: configuration.loginSubtitle,
        logoUrl: configuration.logoUrl,
        faviconUrl: configuration.faviconUrl,
        revision: configuration.revision,
      });
      client.setQueryData(brandingQueryKeys.admin, configuration);
      await client.invalidateQueries({ queryKey: brandingQueryKeys.all, refetchType: 'none' });
    },
  });
}
