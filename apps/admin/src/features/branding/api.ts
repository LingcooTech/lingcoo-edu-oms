import { createBrandingApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const brandingApi = createBrandingApi(appApiClient);
