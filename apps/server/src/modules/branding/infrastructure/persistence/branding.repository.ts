import { and, eq } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { applicationBranding } from './branding.schema.js';

export class BrandingRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async find(executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(applicationBranding)
      .where(eq(applicationBranding.key, 'default'))
      .limit(1);
    return record ?? null;
  }

  async readLocked(executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(applicationBranding)
      .where(eq(applicationBranding.key, 'default'))
      .for('share')
      .limit(1);
    return record ?? null;
  }

  async lock(executor: DatabaseTransaction) {
    const [record] = await executor
      .select()
      .from(applicationBranding)
      .where(eq(applicationBranding.key, 'default'))
      .for('update')
      .limit(1);
    return record ?? null;
  }

  async insert(
    input: Omit<typeof applicationBranding.$inferInsert, 'key' | 'revision'>,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .insert(applicationBranding)
      .values({ ...input, key: 'default', revision: 1 })
      .returning();
    return record;
  }

  async update(
    revision: number,
    input: Pick<
      typeof applicationBranding.$inferInsert,
      'appName' | 'primaryColor' | 'loginTitle' | 'loginSubtitle' | 'updatedBy' | 'updatedAt'
    >,
    executor: DatabaseTransaction,
  ) {
    const [record] = await executor
      .update(applicationBranding)
      .set({ ...input, revision: revision + 1 })
      .where(
        and(eq(applicationBranding.key, 'default'), eq(applicationBranding.revision, revision)),
      )
      .returning();
    return record ?? null;
  }
}
