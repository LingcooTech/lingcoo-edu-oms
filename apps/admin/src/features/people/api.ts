import { createPeopleApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const peopleApi = createPeopleApi(appApiClient);
