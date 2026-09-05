import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './database.schema.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DatabaseExecutor = Database | DatabaseTransaction;

export interface DatabaseHandle {
  readonly db: Database;
  transaction<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    transaction(work) {
      return db.transaction(work);
    },
    async ping() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    },
  };
}
