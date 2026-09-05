import { z } from 'zod';

import type { AppEnvironment } from '../../../config/environment.js';
import type { DatabaseHandle } from '../../../database/database.js';
import type { JobHandlerDefinition, RecurringJobDefinition } from '../../jobs/public.js';
import type { StorageProviderResolver } from '../domain/model.js';
import { AssetRepository } from '../infrastructure/persistence/asset.repository.js';
import { StorageObjectRepository } from '../infrastructure/persistence/storage-object.repository.js';

export class StorageMaintenanceService {
  readonly deleteObjectJobHandler: JobHandlerDefinition<{ objectId: string }>;
  readonly deleteRejectedObjectJobHandler: JobHandlerDefinition<{ objectId: string }>;
  readonly cleanupPendingJobHandler: JobHandlerDefinition<{ scheduledAt: string }>;
  readonly recurringJob: RecurringJobDefinition;

  constructor(
    private readonly environment: AppEnvironment,
    private readonly database: DatabaseHandle,
    private readonly assets: AssetRepository,
    private readonly objects: StorageObjectRepository,
    private readonly providers: StorageProviderResolver,
  ) {
    this.deleteObjectJobHandler = {
      type: 'storage.delete-object',
      queue: 'storage',
      payloadVersion: 1,
      payloadSchema: z.object({ objectId: z.uuid() }),
      maxAttempts: 8,
      timeoutMs: 120_000,
      handler: (payload) => this.deleteObject(payload.objectId),
    };
    this.deleteRejectedObjectJobHandler = {
      type: 'storage.delete-rejected-object',
      queue: 'storage',
      payloadVersion: 1,
      payloadSchema: z.object({ objectId: z.uuid() }),
      maxAttempts: 8,
      timeoutMs: 120_000,
      handler: (payload) => this.deleteRejectedObject(payload.objectId),
    };
    this.cleanupPendingJobHandler = {
      type: 'storage.cleanup-pending',
      queue: 'storage',
      payloadVersion: 1,
      payloadSchema: z.object({ scheduledAt: z.iso.datetime() }),
      maxAttempts: 5,
      timeoutMs: 300_000,
      handler: () => this.cleanupPending(),
    };
    this.recurringJob = {
      key: 'storage.cleanup-pending',
      intervalMs: environment.STORAGE_MAINTENANCE_INTERVAL_MS,
      type: 'storage.cleanup-pending',
      payload: (scheduledAt) => ({ scheduledAt: scheduledAt.toISOString() }),
    };
  }

  async deleteObject(objectId: string): Promise<void> {
    const object = await this.objects.find(objectId);
    if (!object || object.status === 'deleted') return;
    if (object.status !== 'deletion_pending') throw new Error('Storage object is not deletable');
    await this.providers.forProvider(object.provider).delete(object.bucket, object.objectKey);
    await this.database.transaction(async (transaction) => {
      await this.objects.markDeleted(object.id, new Date(), transaction);
    });
  }

  async deleteRejectedObject(objectId: string): Promise<void> {
    const object = await this.objects.find(objectId);
    if (!object || object.status === 'deleted') return;
    if (object.status !== 'failed') throw new Error('Storage object is not rejected');
    await this.providers.forProvider(object.provider).delete(object.bucket, object.objectKey);
  }

  async cleanupPending(): Promise<void> {
    const before = new Date(
      Date.now() - this.environment.STORAGE_PENDING_RETENTION_HOURS * 60 * 60_000,
    );
    const pending = await this.objects.expiredPending(before, 100);
    for (const object of pending) {
      await this.providers.forProvider(object.provider).delete(object.bucket, object.objectKey);
      await this.database.transaction(async (transaction) => {
        const locked = await this.objects.lock(object.id, transaction);
        if (!locked || locked.status !== 'pending') return;
        const failed = await this.objects.markFailed(
          object.id,
          'STORAGE_UPLOAD_EXPIRED',
          new Date(),
          transaction,
        );
        if (failed) {
          await this.assets.failPending(object.assetId, object.version, new Date(), transaction);
        }
      });
    }
  }
}
