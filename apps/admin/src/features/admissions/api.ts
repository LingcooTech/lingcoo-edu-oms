import { createAdmissionsApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const admissionsApi = createAdmissionsApi(appApiClient);
