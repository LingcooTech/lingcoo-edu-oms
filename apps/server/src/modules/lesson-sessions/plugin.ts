import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { IdempotencyService } from '../idempotency/public.js';
import type { LessonConsumptionLedger } from '../lesson-accounts/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import type { StudentDirectory, TeacherDirectory } from '../people/public.js';
import { registerLessonSessionsRoutes } from './api/routes.js';
import { LessonSessionsService } from './application/lesson-sessions.service.js';
import { LessonSessionsRepository } from './infrastructure/persistence/lesson-sessions.repository.js';

export interface LessonSessionsDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  students: StudentDirectory;
  teachers: TeacherDirectory;
  lessonAccounts: LessonConsumptionLedger;
  idempotency: IdempotencyService;
  audit: AuditWriter;
  service?: LessonSessionsService;
}

export function createLessonSessionsService(dependencies: LessonSessionsDependencies) {
  return new LessonSessionsService(
    dependencies.database,
    new LessonSessionsRepository(dependencies.database),
    dependencies.institutions,
    dependencies.students,
    dependencies.teachers,
    dependencies.lessonAccounts,
    dependencies.idempotency,
    dependencies.audit,
  );
}

export function createLessonSessionsModule(
  dependencies: LessonSessionsDependencies,
): FastifyPluginAsync {
  return async (app) => {
    await registerLessonSessionsRoutes(
      app,
      dependencies.service ?? createLessonSessionsService(dependencies),
    );
  };
}
