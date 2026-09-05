import { createMailApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const mailApi = createMailApi(appApiClient);
