import 'dotenv/config';

import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { validateEnvironment } from '../config/environment.js';

const environment = validateEnvironment(process.env);
const pool = new Pool({ connectionString: environment.DATABASE_URL, max: 1 });

try {
  await migrate(drizzle(pool), {
    migrationsFolder: resolve(import.meta.dirname, '../../drizzle'),
  });
  console.info('Database migrations completed');
} finally {
  await pool.end();
}
