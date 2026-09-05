import type { FastifyPluginAsync } from 'fastify';

import type { AppEnvironment } from '../../config/environment.js';
import type { DatabaseHandle } from '../../database/database.js';

export interface HealthModuleDependencies {
  environment: AppEnvironment;
  database: Pick<DatabaseHandle, 'ping'>;
}

export function createHealthModule(dependencies: HealthModuleDependencies): FastifyPluginAsync {
  return async function healthModule(app) {
    app.get(
      '/health/live',
      {
        config: { access: { public: true } },
        schema: {
          tags: ['health'],
          response: {
            200: {
              type: 'object',
              required: ['status', 'info'],
              properties: {
                status: { type: 'string', const: 'ok' },
                info: {
                  type: 'object',
                  required: ['api'],
                  properties: {
                    api: {
                      type: 'object',
                      required: ['status', 'name', 'version'],
                      properties: {
                        status: { type: 'string', const: 'up' },
                        name: { type: 'string' },
                        version: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async () => ({
        status: 'ok' as const,
        info: {
          api: {
            status: 'up' as const,
            name: dependencies.environment.APP_NAME,
            version: dependencies.environment.APP_VERSION,
          },
        },
      }),
    );

    app.get(
      '/health/ready',
      {
        config: { access: { public: true } },
        schema: {
          tags: ['health'],
          response: {
            200: {
              type: 'object',
              required: ['status', 'info'],
              properties: {
                status: { type: 'string', const: 'ok' },
                info: {
                  type: 'object',
                  required: ['database'],
                  properties: {
                    database: {
                      type: 'object',
                      required: ['status'],
                      properties: { status: { type: 'string', const: 'up' } },
                    },
                  },
                },
              },
            },
            503: {
              type: 'object',
              required: ['status', 'error'],
              properties: {
                status: { type: 'string', const: 'error' },
                error: {
                  type: 'object',
                  required: ['database'],
                  properties: {
                    database: {
                      type: 'object',
                      required: ['status'],
                      properties: { status: { type: 'string', const: 'down' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async (_request, reply) => {
        try {
          await dependencies.database.ping();
          return { status: 'ok' as const, info: { database: { status: 'up' as const } } };
        } catch {
          return reply
            .status(503)
            .send({ status: 'error' as const, error: { database: { status: 'down' as const } } });
        }
      },
    );
  };
}
