import { createLessonSessionsApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const lessonSessionsApi = createLessonSessionsApi(appApiClient);
