import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { AuditWriter } from '../audit/public.js';
import type { LessonSessionSchedulingPort } from '../lesson-sessions/public.js';
import type { InstitutionDirectory } from '../organization/public.js';
import type { StudentDirectory, TeacherDirectory } from '../people/public.js';
import { registerTeachingResourcesRoutes } from './api/routes.js';
import { TeachingResourcesService } from './application/teaching-resources.service.js';
import { TeachingResourcesRepository } from './infrastructure/persistence/teaching-resources.repository.js';

export interface TeachingResourcesDependencies {
  database: DatabaseHandle;
  institutions: InstitutionDirectory;
  students: StudentDirectory;
  teachers: TeacherDirectory;
  sessions: LessonSessionSchedulingPort;
  audit: AuditWriter;
  service?: TeachingResourcesService;
}

export function createTeachingResourcesService(dependencies: TeachingResourcesDependencies) {
  return new TeachingResourcesService(
    dependencies.database,
    new TeachingResourcesRepository(dependencies.database),
    dependencies.institutions,
    dependencies.students,
    dependencies.teachers,
    dependencies.sessions,
    dependencies.audit,
  );
}

export function createTeachingResourcesModule(
  dependencies: TeachingResourcesDependencies,
): FastifyPluginAsync {
  return async (app) =>
    registerTeachingResourcesRoutes(
      app,
      dependencies.service ?? createTeachingResourcesService(dependencies),
    );
}
