import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangePasswordRequest,
  ConfirmPasswordReset,
  LoginRequest,
} from '@lingcoo-edu-oms/contracts';

import { identityApi } from './api';

export const identityQueryKeys = {
  session: ['identity', 'session'] as const,
  sessions: ['identity', 'sessions'] as const,
};

export function useSession() {
  return useQuery({
    queryKey: identityQueryKeys.session,
    queryFn: () => identityApi.getSession(),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginRequest) => identityApi.login(input),
    onSuccess: (session) => {
      queryClient.removeQueries({ queryKey: ['access'] });
      queryClient.setQueryData(identityQueryKeys.session, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => identityApi.logout(),
    onSettled: () => {
      queryClient.setQueryData(identityQueryKeys.session, null);
      queryClient.removeQueries({ queryKey: identityQueryKeys.sessions });
      queryClient.removeQueries({ queryKey: ['access'] });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordRequest) => identityApi.changePassword(input),
    onSuccess: () => queryClient.setQueryData(identityQueryKeys.session, null),
  });
}

export function useIdentitySessions() {
  return useQuery({
    queryKey: identityQueryKeys.sessions,
    queryFn: () => identityApi.listSessions(),
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => identityApi.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: identityQueryKeys.sessions }),
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => identityApi.requestPasswordReset(email) });
}

export function useConfirmPasswordReset() {
  return useMutation({
    mutationFn: (input: ConfirmPasswordReset) => identityApi.confirmPasswordReset(input),
  });
}

export function useRequestEmailVerification() {
  return useMutation({ mutationFn: () => identityApi.requestEmailVerification() });
}

export function useConfirmEmailVerification() {
  return useMutation({
    mutationFn: (token: string) => identityApi.confirmEmailVerification(token),
  });
}
