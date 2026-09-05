import type { EncryptedEnvelope } from '@lingcoo-tech/crypto';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import type { DatabaseExecutor, DatabaseHandle } from '../../../../database/database.js';
import { systemSettings } from './settings.schema.js';

export interface StoredSettingValue {
  value: unknown | null;
  encryptedValue: EncryptedEnvelope | null;
  encryptionKeyId: string | null;
}

export class SettingsRepository {
  constructor(private readonly database: DatabaseHandle) {}

  findAll(executor: DatabaseExecutor = this.database.db) {
    return executor.select().from(systemSettings);
  }

  async find(key: string, executor: DatabaseExecutor = this.database.db) {
    const [record] = await executor
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return record ?? null;
  }

  async save(
    key: string,
    stored: StoredSettingValue,
    updatedBy: string,
    expectedVersion: number | null,
    executor: DatabaseExecutor,
  ) {
    if (expectedVersion === null) {
      const [created] = await executor
        .insert(systemSettings)
        .values({ key, ...stored, updatedBy })
        .onConflictDoNothing()
        .returning();
      return created ?? null;
    }
    const [updated] = await executor
      .update(systemSettings)
      .set({
        ...stored,
        updatedBy,
        updatedAt: new Date(),
        version: sql`${systemSettings.version} + 1`,
      })
      .where(and(eq(systemSettings.key, key), eq(systemSettings.version, expectedVersion)))
      .returning();
    return updated ?? null;
  }

  async clear(key: string, expectedVersion: number, executor: DatabaseExecutor) {
    const [record] = await executor
      .delete(systemSettings)
      .where(and(eq(systemSettings.key, key), eq(systemSettings.version, expectedVersion)))
      .returning();
    return record ?? null;
  }

  encryptedForUpdate(executor: DatabaseExecutor) {
    return executor
      .select()
      .from(systemSettings)
      .where(isNotNull(systemSettings.encryptedValue))
      .for('update');
  }

  async replaceEncryption(
    key: string,
    encryptedValue: EncryptedEnvelope,
    encryptionKeyId: string,
    expectedVersion: number,
    updatedBy: string,
    executor: DatabaseExecutor,
  ) {
    const [record] = await executor
      .update(systemSettings)
      .set({
        encryptedValue,
        encryptionKeyId,
        updatedBy,
        updatedAt: new Date(),
        version: sql`${systemSettings.version} + 1`,
      })
      .where(and(eq(systemSettings.key, key), eq(systemSettings.version, expectedVersion)))
      .returning();
    return record ?? null;
  }
}
