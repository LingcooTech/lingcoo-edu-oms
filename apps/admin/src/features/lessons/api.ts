import { createLessonAccountsApi, createLessonPackagesApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const lessonPackagesApi = createLessonPackagesApi(appApiClient);
export const lessonAccountsApi = createLessonAccountsApi(appApiClient);
