import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateInstitutionRequest,
  InstitutionListQuery,
  UpdateInstitutionRequest,
  UpdateOrganizationProfileRequest,
} from '@lingcoo-edu-oms/contracts';

import { organizationApi } from './api';

export const institutionQueryKeys = {
  all: ['education', 'institutions'] as const,
  list: (query: Partial<InstitutionListQuery>) =>
    [...institutionQueryKeys.all, 'list', query] as const,
};

export const organizationProfileQueryKey = ['education', 'organization', 'profile'] as const;

export function useOrganizationProfile() {
  return useQuery({
    queryKey: organizationProfileQueryKey,
    queryFn: () => organizationApi.getProfile(),
  });
}

export function useUpdateOrganizationProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrganizationProfileRequest) => organizationApi.updateProfile(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationProfileQueryKey });
      void queryClient.invalidateQueries({ queryKey: institutionQueryKeys.all });
    },
  });
}

export function useInstitutions(query: Partial<InstitutionListQuery>) {
  return useQuery({
    queryKey: institutionQueryKeys.list(query),
    queryFn: () => organizationApi.list(query),
  });
}

export function useCreateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInstitutionRequest) => organizationApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: institutionQueryKeys.all }),
  });
}

export function useUpdateInstitution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInstitutionRequest }) =>
      organizationApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: institutionQueryKeys.all }),
  });
}
