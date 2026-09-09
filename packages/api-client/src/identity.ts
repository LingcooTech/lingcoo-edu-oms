import {
  acceptedActionSchema,
  identitySessionListSchema,
  nativeSessionIdentitySchema,
  sessionIdentitySchema,
  type ChangePasswordRequest,
  type ConfirmPasswordReset,
  type LoginRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';
import { ApiClientError } from './errors.js';

export function createIdentityApi(client: ApiClient) {
  return {
    login(input: LoginRequest) {
      return client.request({
        method: 'POST',
        path: '/api/auth/login',
        body: input,
        schema: sessionIdentitySchema,
      });
    },
    nativeLogin(input: LoginRequest) {
      return client.request({
        method: 'POST',
        path: '/api/auth/native/login',
        body: input,
        schema: nativeSessionIdentitySchema,
      });
    },
    async getSession() {
      try {
        return await client.request({ path: '/api/auth/me', schema: sessionIdentitySchema });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) return null;
        throw error;
      }
    },
    logout() {
      return client.request({
        method: 'POST',
        path: '/api/auth/logout',
        schema: acceptedActionSchema,
      });
    },
    changePassword(input: ChangePasswordRequest) {
      return client.request({
        method: 'POST',
        path: '/api/auth/password/change',
        body: input,
        schema: acceptedActionSchema,
      });
    },
    requestPasswordReset(email: string) {
      return client.request({
        method: 'POST',
        path: '/api/auth/password-reset/request',
        body: { email },
        schema: acceptedActionSchema,
      });
    },
    confirmPasswordReset(input: ConfirmPasswordReset) {
      return client.request({
        method: 'POST',
        path: '/api/auth/password-reset/confirm',
        body: input,
        schema: acceptedActionSchema,
      });
    },
    requestEmailVerification() {
      return client.request({
        method: 'POST',
        path: '/api/auth/email-verification/request',
        schema: acceptedActionSchema,
      });
    },
    confirmEmailVerification(token: string) {
      return client.request({
        method: 'POST',
        path: '/api/auth/email-verification/confirm',
        body: { token },
        schema: acceptedActionSchema,
      });
    },
    listSessions() {
      return client.request({ path: '/api/auth/sessions', schema: identitySessionListSchema });
    },
    revokeSession(sessionId: string) {
      return client.request({
        method: 'POST',
        path: `/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
        schema: acceptedActionSchema,
      });
    },
  };
}

export type IdentityApi = ReturnType<typeof createIdentityApi>;
