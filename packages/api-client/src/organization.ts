import {
  createInstitutionRequestSchema,
  institutionListQuerySchema,
  institutionPageSchema,
  institutionSchema,
  organizationProfileSchema,
  updateInstitutionRequestSchema,
  updateOrganizationProfileRequestSchema,
  type CreateInstitutionRequest,
  type InstitutionListQuery,
  type UpdateOrganizationProfileRequest,
  type UpdateInstitutionRequest,
} from '@lingcoo-edu-oms/contracts';

import { idSchema } from '@lingcoo-edu-oms/contracts';
import type { ApiClient } from './client.js';

function queryString(input: InstitutionListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function institutionPath(id: string): string {
  return `/api/institutions/${encodeURIComponent(idSchema.parse(id))}`;
}

export function createOrganizationApi(client: ApiClient) {
  return {
    getProfile() {
      return client.request({ path: '/api/organization', schema: organizationProfileSchema });
    },
    updateProfile(input: UpdateOrganizationProfileRequest) {
      return client.request({
        method: 'PATCH',
        path: '/api/organization',
        body: updateOrganizationProfileRequestSchema.parse(input),
        schema: organizationProfileSchema,
      });
    },
    list(input: Partial<InstitutionListQuery> = {}) {
      const query = institutionListQuerySchema.parse(input);
      return client.request({
        path: `/api/institutions${queryString(query)}`,
        schema: institutionPageSchema,
      });
    },
    get(id: string) {
      return client.request({ path: institutionPath(id), schema: institutionSchema });
    },
    create(input: CreateInstitutionRequest) {
      return client.request({
        method: 'POST',
        path: '/api/institutions',
        body: createInstitutionRequestSchema.parse(input),
        schema: institutionSchema,
      });
    },
    update(id: string, input: UpdateInstitutionRequest) {
      return client.request({
        method: 'PATCH',
        path: institutionPath(id),
        body: updateInstitutionRequestSchema.parse(input),
        schema: institutionSchema,
      });
    },
  };
}

export type OrganizationApi = ReturnType<typeof createOrganizationApi>;
