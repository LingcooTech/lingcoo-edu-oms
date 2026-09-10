import { createContentApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const contentApi = createContentApi(appApiClient);
