import { createStorageApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const storageApi = createStorageApi(appApiClient);
