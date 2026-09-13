import { createPeopleApi, createStudent360Api } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const peopleApi = createPeopleApi(appApiClient);
export const student360Api = createStudent360Api(appApiClient);
