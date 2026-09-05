import {
  brandingConfigurationSchema,
  publicBrandingSchema,
  updateBrandingRequestSchema,
  type UpdateBrandingRequest,
} from '@lingcoo-edu-oms/contracts';

import type { ApiClient } from './client.js';

export function createBrandingApi(client: ApiClient) {
  return {
    getPublic() {
      return client.request({ path: '/api/branding/public', schema: publicBrandingSchema });
    },
    get() {
      return client.request({ path: '/api/branding', schema: brandingConfigurationSchema });
    },
    update(input: UpdateBrandingRequest) {
      return client.request({
        path: '/api/branding',
        method: 'PUT',
        body: updateBrandingRequestSchema.parse(input),
        schema: brandingConfigurationSchema,
      });
    },
  };
}

export type BrandingApi = ReturnType<typeof createBrandingApi>;
