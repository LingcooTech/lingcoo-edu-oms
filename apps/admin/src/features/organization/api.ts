import { createOrganizationApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const organizationApi = createOrganizationApi(appApiClient);
