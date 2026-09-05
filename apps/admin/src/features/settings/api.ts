import { createSettingsApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const settingsApi = createSettingsApi(appApiClient);
