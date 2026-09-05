export { JobHandlerRegistry } from './application/job-handler.registry.js';
export { JobsService } from './application/jobs.service.js';
export { RecurringJobRegistry } from './application/recurring-job.registry.js';
export { jobBackoffMilliseconds } from './domain/backoff.js';
export type {
  EnqueueJobInput,
  EnqueueJobResult,
  JobDefinition,
  JobFailureSnapshot,
  JobHandlerContext,
  JobHandlerDefinition,
  JobQueue,
  RecurringJobDefinition,
} from './domain/model.js';
export { createJobsModule, createJobsRunner, createJobsService } from './plugin.js';
// Mail owns the cross-module foreign key and imports this table only through the public boundary.
export { jobs } from './infrastructure/persistence/jobs.schema.js';
