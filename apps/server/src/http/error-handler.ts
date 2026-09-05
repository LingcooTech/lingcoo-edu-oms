import {
  ApiError,
  apiErrorResponseFromException,
  createApiErrorResponse,
} from '@lingcoo-tech/http';
import type { FastifyError, FastifyInstance } from 'fastify';

type ValidationError = FastifyError & { validation?: unknown };

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: ValidationError, request, reply) => {
    if (error.validation) {
      return reply.status(400).send(
        createApiErrorResponse(
          {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.validation,
          },
          request.id,
        ),
      );
    }

    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .status(413)
        .send(
          createApiErrorResponse(
            { code: 'REQUEST_BODY_TOO_LARGE', message: '请求内容超过允许大小' },
            request.id,
          ),
        );
    }

    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(apiErrorResponseFromException(error, request.id));
    }

    request.log.error({ err: error }, 'request failed');
    return reply.status(500).send(apiErrorResponseFromException(error, request.id));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(
        createApiErrorResponse({ code: 'NOT_FOUND', message: 'Resource not found' }, request.id),
      ),
  );
}
