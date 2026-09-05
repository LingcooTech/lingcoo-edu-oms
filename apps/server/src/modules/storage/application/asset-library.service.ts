import { ApiError } from '@lingcoo-tech/http';
import type {
  AssetDetail,
  AssetQuery,
  DeleteAssetRequest,
  UpdateAssetRequest,
} from '@lingcoo-edu-oms/contracts';

import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { JobQueue } from '../../jobs/public.js';
import type { ReadableAsset, StorageProviderResolver } from '../domain/model.js';
import { AssetRepository } from '../infrastructure/persistence/asset.repository.js';
import { StorageObjectRepository } from '../infrastructure/persistence/storage-object.repository.js';
import { toAssetDetail, toAssetSummary } from './asset-view.js';

type ActorContext = AuditContext & { actorId: string };

export class AssetLibraryService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly assets: AssetRepository,
    private readonly objects: StorageObjectRepository,
    private readonly providers: StorageProviderResolver,
    private readonly jobs: JobQueue,
    private readonly audit: AuditWriter,
  ) {}

  async list(query: AssetQuery) {
    const result = await this.assets.search(query);
    return {
      items: result.items.map((item) =>
        toAssetSummary(item.asset, item.object, item.referenceCount),
      ),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AssetDetail> {
    const [current, versions, referenceCount] = await Promise.all([
      this.assets.currentObject(id),
      this.objects.versions(id),
      this.assets.referenceCount(id),
    ]);
    if (!current || current.asset.status === 'deleted') this.notFound();
    return toAssetDetail(toAssetSummary(current.asset, current.object, referenceCount), versions);
  }

  async update(id: string, input: UpdateAssetRequest, context: ActorContext) {
    await this.database.transaction(async (transaction) => {
      const before = await this.assets.lock(id, transaction);
      if (!before || before.status === 'deleted') this.notFound();
      const updated = await this.assets.updateMetadata(
        id,
        input.expectedRevision,
        { ...input, actorId: context.actorId },
        new Date(),
        transaction,
      );
      if (!updated) this.stateConflict();
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'storage.asset.updated',
          resourceType: 'storage.asset',
          resourceId: id,
          changes: [
            { field: 'displayName', before: before.displayName, after: updated.displayName },
            { field: 'altText', before: before.altText, after: updated.altText },
            { field: 'visibility', before: before.visibility, after: updated.visibility },
          ],
        },
        transaction,
      );
    });
    return this.get(id);
  }

  async delete(id: string, input: DeleteAssetRequest, context: ActorContext) {
    await this.database.transaction(async (transaction) => {
      const asset = await this.assets.lock(id, transaction);
      if (!asset || asset.status === 'deleted') this.notFound();
      if (asset.pendingVersion !== null) {
        throw new ApiError(409, 'STORAGE_ASSET_UPLOAD_IN_PROGRESS', '素材正在上传新版本');
      }
      const referenceCount = await this.assets.referenceCount(id, transaction);
      if (referenceCount > 0) {
        throw new ApiError(409, 'STORAGE_ASSET_IN_USE', '素材仍被业务数据引用，不能删除', {
          referenceCount,
        });
      }
      const deleted = await this.assets.markDeleted(
        id,
        input.expectedRevision,
        context.actorId,
        new Date(),
        transaction,
      );
      if (!deleted) this.stateConflict();
      const versions = (await this.objects.versions(id, transaction)).filter((object) =>
        ['ready', 'superseded'].includes(object.status),
      );
      const pending = await this.objects.markManyDeletionPending(
        versions.map((item) => item.id),
        new Date(),
        transaction,
      );
      for (const object of pending) {
        await this.jobs.enqueue(
          {
            type: 'storage.delete-object',
            payload: { objectId: object.id },
            deduplicationKey: `storage:delete:${object.id}`,
          },
          transaction,
        );
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: 'storage.asset.deleted',
          resourceType: 'storage.asset',
          resourceId: id,
          metadata: { versionsScheduledForDeletion: pending.length },
        },
        transaction,
      );
    });
    return { id };
  }

  async content(id: string, publicOnly: boolean): Promise<ReadableAsset> {
    const current = await this.assets.currentObject(id);
    if (
      !current ||
      current.asset.status !== 'active' ||
      !current.object ||
      current.object.status !== 'ready' ||
      !current.object.contentType ||
      !current.object.sizeBytes ||
      !current.object.checksumSha256 ||
      (publicOnly && current.asset.visibility !== 'public')
    ) {
      this.notFound();
    }
    const stored = await this.providers
      .forProvider(current.object.provider)
      .read(current.object.bucket, current.object.objectKey);
    if (!stored || stored.contentLength !== current.object.sizeBytes) {
      throw new ApiError(503, 'STORAGE_CONTENT_UNAVAILABLE', '素材内容暂时不可用');
    }
    return {
      id,
      visibility: current.asset.visibility,
      displayName: current.asset.displayName,
      originalName: current.object.originalName,
      contentType: current.object.contentType,
      sizeBytes: current.object.sizeBytes,
      checksumSha256: current.object.checksumSha256,
      body: stored.body,
    };
  }

  private notFound(): never {
    throw new ApiError(404, 'STORAGE_ASSET_NOT_FOUND', '素材不存在');
  }

  private stateConflict(): never {
    throw new ApiError(409, 'STORAGE_ASSET_STATE_CHANGED', '素材状态或版本已变化，请刷新后重试');
  }
}
