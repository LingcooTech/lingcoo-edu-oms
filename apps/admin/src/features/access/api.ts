import { createAccessControlApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const accessApi = createAccessControlApi(appApiClient);
