import { createPaymentsApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const paymentsApi = createPaymentsApi(appApiClient);
