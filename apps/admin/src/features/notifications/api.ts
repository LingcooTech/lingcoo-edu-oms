import { createNotificationsApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const notificationsApi = createNotificationsApi(appApiClient);
