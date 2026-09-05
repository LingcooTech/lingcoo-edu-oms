import type { JobHandlerDefinition, RecurringJobDefinition } from './modules/jobs/public.js';

// Application modules register concrete handlers here so API enqueue validation and
// the standalone Worker always use the same definitions.
export const applicationJobHandlers: JobHandlerDefinition[] = [];
export const applicationRecurringJobs: RecurringJobDefinition[] = [];
