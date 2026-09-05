import { createIdempotencyApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const idempotencyApi = createIdempotencyApi(appApiClient);
