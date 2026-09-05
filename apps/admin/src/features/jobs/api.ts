import { createJobsApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const jobsApi = createJobsApi(appApiClient);
