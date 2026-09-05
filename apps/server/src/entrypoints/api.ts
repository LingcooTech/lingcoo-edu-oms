import 'dotenv/config';

import { buildApp } from '../app.js';
import { validateEnvironment } from '../config/environment.js';

const environment = validateEnvironment(process.env);
const app = await buildApp({ environment });

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down API');
  await app.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'API failed to start');
  await app.close();
  process.exitCode = 1;
}
