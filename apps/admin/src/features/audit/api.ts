import { createAuditApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const auditApi = createAuditApi(appApiClient);
