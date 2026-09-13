import { ApiError } from '@lingcoo-tech/http';
import { student360ResponseSchema } from '@lingcoo-edu-oms/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Student360Service } from '../application/student-360.service.js';

const paramsSchema = z.object({ institutionId: z.uuid(), studentId: z.uuid() });

export async function registerStudent360Routes(app: FastifyInstance, service: Student360Service) {
  app.get(
    '/api/institutions/:institutionId/students/:studentId/360',
    {
      config: {
        access: {
          permissions: [
            'education.students.read',
            'education.lesson-balances.read',
            'education.lesson-packages.read',
            'education.orders.read',
            'education.sessions.read',
            'education.attendance.read',
            'education.classes.read',
          ],
          education: {
            institutionParam: 'institutionId',
            permission: 'education.students.read',
          },
        },
      },
    },
    async (request) => {
      const result = paramsSchema.safeParse(request.params);
      if (!result.success) {
        throw new ApiError(
          400,
          'VALIDATION_ERROR',
          '请求参数校验失败',
          z.flattenError(result.error),
        );
      }
      return student360ResponseSchema.parse(
        await service.get(result.data.institutionId, result.data.studentId, scope(request)),
      );
    },
  );
}

function scope(request: FastifyRequest) {
  if (!request.educationScope) {
    throw new ApiError(403, 'ACCESS_SCOPE_REQUIRED', '缺少教务数据范围');
  }
  return request.educationScope;
}
