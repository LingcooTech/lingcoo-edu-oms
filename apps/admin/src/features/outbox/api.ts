import { createOutboxApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const outboxApi = createOutboxApi(appApiClient);
