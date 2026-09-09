export { LessonSessionsService } from './application/lesson-sessions.service.js';
export type { LessonSessionActor } from './application/lesson-sessions.service.js';
export type {
  LessonSessionResourceConflictPolicy,
  LessonSessionSchedulingPort,
  SchedulingOverlap,
  SchedulingSessionInput,
} from './application/lesson-sessions.service.js';
export { createLessonSessionsModule, createLessonSessionsService } from './plugin.js';
