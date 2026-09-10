import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdmissionLeadListQuery,
  AdmissionTrialListQuery,
  BookAdmissionTrialRequest,
  CheckInAdmissionTrialRequest,
  ConvertAdmissionLeadRequest,
  CreateAdmissionFollowUpRequest,
  CreateAdmissionLeadRequest,
  CreateAdmissionTrialRequest,
  UpdateAdmissionLeadRequest,
  UpdateAdmissionTrialRequest,
} from '@lingcoo-edu-oms/contracts';

import { admissionsApi } from './api';

const admissionsKeys = {
  all: ['education', 'admissions'] as const,
  leads: (query: Partial<AdmissionLeadListQuery>) =>
    [...admissionsKeys.all, 'leads', query] as const,
  lead: (id: string) => [...admissionsKeys.all, 'lead', id] as const,
  followUps: (id: string) => [...admissionsKeys.all, 'follow-ups', id] as const,
  trials: (query: Partial<AdmissionTrialListQuery>) =>
    [...admissionsKeys.all, 'trials', query] as const,
  registrations: (id: string) => [...admissionsKeys.all, 'registrations', id] as const,
};

export function useAdmissionLeads(query: Partial<AdmissionLeadListQuery>) {
  return useQuery({
    queryKey: admissionsKeys.leads(query),
    queryFn: () => admissionsApi.listLeads(query),
  });
}

export function useAdmissionLead(id: string | null) {
  return useQuery({
    queryKey: admissionsKeys.lead(id ?? ''),
    queryFn: () => admissionsApi.getLead(id!),
    enabled: Boolean(id),
  });
}

export function useAdmissionFollowUps(id: string | null) {
  return useQuery({
    queryKey: admissionsKeys.followUps(id ?? ''),
    queryFn: () => admissionsApi.listFollowUps(id!),
    enabled: Boolean(id),
  });
}

export function useAdmissionTrials(query: Partial<AdmissionTrialListQuery>) {
  return useQuery({
    queryKey: admissionsKeys.trials(query),
    queryFn: () => admissionsApi.listTrials(query),
  });
}

export function useAdmissionRegistrations(id: string | null) {
  return useQuery({
    queryKey: admissionsKeys.registrations(id ?? ''),
    queryFn: () => admissionsApi.listRegistrations(id!),
    enabled: Boolean(id),
  });
}

function invalidateAdmissions(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: admissionsKeys.all });
}

export function useCreateAdmissionLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdmissionLeadRequest) => admissionsApi.createLead(input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useUpdateAdmissionLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdmissionLeadRequest }) =>
      admissionsApi.updateLead(id, input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useAddAdmissionFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateAdmissionFollowUpRequest }) =>
      admissionsApi.addFollowUp(id, input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useBookAdmissionTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BookAdmissionTrialRequest }) =>
      admissionsApi.bookTrial(id, input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useConvertAdmissionLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConvertAdmissionLeadRequest }) =>
      admissionsApi.convertLead(id, input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useCreateAdmissionTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdmissionTrialRequest) => admissionsApi.createTrial(input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useUpdateAdmissionTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdmissionTrialRequest }) =>
      admissionsApi.updateTrial(id, input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}

export function useCheckInAdmissionTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      trialId,
      leadId,
      input,
    }: {
      trialId: string;
      leadId: string;
      input?: CheckInAdmissionTrialRequest;
    }) => admissionsApi.checkIn(trialId, leadId, input),
    onSuccess: () => invalidateAdmissions(queryClient),
  });
}
