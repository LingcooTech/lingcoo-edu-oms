import { createLessonCommerceApi } from '@lingcoo-edu-oms/api-client';

import { appApiClient } from '../identity/api';

export const lessonCommerceApi = createLessonCommerceApi(appApiClient);
