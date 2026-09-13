import type { FastifyPluginAsync } from 'fastify';

import { registerStudent360Routes } from './api/routes.js';
import { Student360Service } from './application/student-360.service.js';
import type { Student360Dependencies } from './domain/ports.js';

export function createStudent360Service(dependencies: Student360Dependencies) {
  return new Student360Service(dependencies);
}

export function createStudent360Module(
  dependencies: Student360Dependencies & { service?: Student360Service },
): FastifyPluginAsync {
  return async (app) => {
    await registerStudent360Routes(
      app,
      dependencies.service ?? createStudent360Service(dependencies),
    );
  };
}
