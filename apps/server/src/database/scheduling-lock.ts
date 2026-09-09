import { sql } from 'drizzle-orm';

import type { DatabaseTransaction } from './database.js';

// Scheduling resources are shared across institutions in this single-tenant system.
// Serialize conflict-checking mutations so two concurrent requests cannot both
// observe an available teacher/classroom and then create an overlap.
export async function acquireSchedulingConflictLock(transaction: DatabaseTransaction) {
  await transaction.execute(sql`select pg_advisory_xact_lock(710064006)`);
}
