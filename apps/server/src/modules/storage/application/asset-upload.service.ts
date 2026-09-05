import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

import { ApiError } from '@lingcoo-tech/http';
import type {
  AuthorizeAssetReplacementRequest,
  AuthorizeAssetUploadRequest,
  StorageUploadAuthorization,
} from '@lingcoo-edu-oms/contracts';

import type { AppEnvironment } from '../../../config/environment.js';
import type { DatabaseHandle } from '../../../database/database.js';
import type { AuditContext, AuditWriter } from '../../audit/public.js';
import type { JobQueue } from '../../jobs/public.js';
import { assertDeclaredAssetType, inspectAssetContent } from '../domain/content-inspection.js';
import type { StorageProviderResolver } from '../domain/model.js';
import { AssetRepository } from '../infrastructure/persistence/asset.repository.js';
import { StorageObjectRepository } from '../infrastructure/persistence/storage-object.repository.js';
import type { AssetLibraryService } from './asset-library.service.js';
import { storageDigest } from './storage-hash.js';

type ActorContext = AuditContext & { actorId: string };

export class AssetUploadService {
  constructor(
    private readonly environment: AppEnvironment,
    private readonly database: DatabaseHandle,
    private readonly assets: AssetRepository,
    private readonly objects: StorageObjectRepository,
    private readonly providers: StorageProviderResolver,
    private readonly jobs: JobQueue,
    private readonly audit: AuditWriter,
    private readonly library: AssetLibraryService,
  ) {}

  authorizeNew(input: AuthorizeAssetUploadRequest, idempotencyKey: string, context: ActorContext) {
    return this.authorize(input, null, idempotencyKey, context);
  }

  authorizeReplacement(
    assetId: string,
    input: AuthorizeAssetReplacementRequest,
    idempotencyKey: string,
    context: ActorContext,
  ) {
    return this.authorize(input, assetId, idempotencyKey, context);
  }

  private async authorize(
    input: AuthorizeAssetUploadRequest | AuthorizeAssetReplacementRequest,
    replacingAssetId: string | null,
    idempotencyKey: string,
    context: ActorContext,
  ): Promise<StorageUploadAuthorization> {
    if (input.sizeBytes > this.environment.STORAGE_MAX_UPLOAD_BYTES) {
      throw new ApiError(413, 'STORAGE_FILE_TOO_LARGE', '文件超过系统允许的大小');
    }
    const declaredMediaKind = assertDeclaredAssetType(input.contentType);
    const deduplicationHash = storageDigest({ actorId: context.actorId, idempotencyKey });
    const requestHash = storageDigest({ input, replacingAssetId });
    const reservation = await this.database.transaction(async (transaction) => {
      const existing = await this.objects.findByDeduplication(deduplicationHash, transaction);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ApiError(409, 'STORAGE_IDEMPOTENCY_CONFLICT', '同一幂等键已用于不同上传');
        }
        const asset = await this.assets.find(existing.assetId, transaction);
        if (!asset) throw new Error('Storage upload asset invariant failed');
        return { asset, object: existing, existing: true };
      }

      const provider = await this.providers.current();
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + this.environment.STORAGE_UPLOAD_EXPIRY_SECONDS * 1_000,
      );
      const bucket = await provider.bucket();
      let asset;
      let version: number;
      if (replacingAssetId) {
        const current = await this.assets.lock(replacingAssetId, transaction);
        if (!current || current.status === 'deleted') {
          throw new ApiError(404, 'STORAGE_ASSET_NOT_FOUND', '素材不存在');
        }
        if (current.mediaKind && current.mediaKind !== declaredMediaKind) {
          throw new ApiError(
            415,
            'STORAGE_MEDIA_KIND_MISMATCH',
            '替换文件必须保持原素材的媒体类型',
          );
        }
        const expectedRevision = (input as AuthorizeAssetReplacementRequest).expectedRevision;
        version = current.currentVersion + 1;
        asset = await this.assets.reserveReplacement(
          replacingAssetId,
          expectedRevision,
          version,
          context.actorId,
          now,
          transaction,
        );
        if (!asset) this.stateConflict();
      } else {
        version = 1;
        const create = input as AuthorizeAssetUploadRequest;
        asset = await this.assets.insert(
          {
            status: 'uploading',
            visibility: create.visibility,
            displayName: create.displayName ?? displayName(create.filename),
            altText: create.altText,
            pendingVersion: version,
            createdBy: context.actorId,
            updatedBy: context.actorId,
          },
          transaction,
        );
      }
      if (!asset) throw new Error('Storage asset reservation failed');
      const objectId = randomUUID();
      const object = await this.objects.insert(
        {
          id: objectId,
          assetId: asset.id,
          version,
          provider: provider.provider,
          bucket,
          objectKey: objectKey(asset.id, version, objectId),
          originalName: input.filename,
          declaredContentType: input.contentType,
          declaredSizeBytes: input.sizeBytes,
          status: 'pending',
          uploadExpiresAt: expiresAt,
          deduplicationHash,
          requestHash,
          createdBy: context.actorId,
        },
        transaction,
      );
      if (!object) throw new ApiError(409, 'STORAGE_UPLOAD_RESERVATION_CONFLICT', '上传预授权冲突');
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: replacingAssetId
            ? 'storage.asset.replacement-authorized'
            : 'storage.asset.upload-authorized',
          resourceType: 'storage.asset',
          resourceId: asset.id,
          metadata: {
            provider: provider.provider,
            version,
            declaredContentType: input.contentType,
            declaredSizeBytes: input.sizeBytes,
          },
        },
        transaction,
      );
      return { asset, object, existing: false };
    });

    const completed = reservation.object.status === 'ready';
    if (completed) {
      return {
        assetId: reservation.asset.id,
        objectId: reservation.object.id,
        assetRevision: reservation.asset.revision,
        completed: true,
        upload: null,
      };
    }
    if (reservation.object.status !== 'pending') {
      throw new ApiError(
        409,
        'STORAGE_UPLOAD_NOT_REUSABLE',
        '该幂等上传已终止，请使用新的 Idempotency-Key',
      );
    }
    if (reservation.object.uploadExpiresAt.getTime() <= Date.now()) {
      throw new ApiError(410, 'STORAGE_UPLOAD_AUTHORIZATION_EXPIRED', '上传预授权已过期');
    }
    const provider = this.providers.forProvider(reservation.object.provider);
    const upload = await provider.authorizeUpload({
      objectId: reservation.object.id,
      objectKey: reservation.object.objectKey,
      contentType: reservation.object.declaredContentType,
      sizeBytes: reservation.object.declaredSizeBytes,
      expiresAt: reservation.object.uploadExpiresAt,
    });
    return {
      assetId: reservation.asset.id,
      objectId: reservation.object.id,
      assetRevision: reservation.asset.revision,
      completed: false,
      upload: { ...upload, expiresAt: upload.expiresAt.toISOString() },
    };
  }

  async uploadLocal(objectId: string, body: Buffer, context: ActorContext) {
    const object = await this.requirePending(objectId);
    if (object.provider !== 'local') {
      throw new ApiError(409, 'STORAGE_UPLOAD_NOT_LOCAL', '当前上传应直接发送到对象存储');
    }
    let facts;
    try {
      facts = await inspectAssetContent({
        body,
        filename: object.originalName,
        declaredContentType: object.declaredContentType,
        declaredSizeBytes: object.declaredSizeBytes,
        maxBytes: this.environment.STORAGE_MAX_UPLOAD_BYTES,
      });
    } catch (error) {
      await this.failUpload(object, 'STORAGE_CONTENT_REJECTED', context);
      throw error;
    }
    const provider = this.providers.forProvider('local');
    if (!provider.write) throw new Error('Local storage write capability is unavailable');
    await provider.write(object.objectKey, body);
    try {
      return await this.finalize(objectId, facts, context);
    } catch (error) {
      await provider.delete(object.bucket, object.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async complete(objectId: string, context: ActorContext) {
    const object = await this.objects.find(objectId);
    if (!object) throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', '上传对象不存在');
    if (object.status === 'ready') return this.library.get(object.assetId);
    if (object.status !== 'pending') this.uploadStateConflict();
    const provider = this.providers.forProvider(object.provider);
    const stored = await provider.read(object.bucket, object.objectKey);
    if (!stored) throw new ApiError(409, 'STORAGE_OBJECT_MISSING', '尚未找到上传内容');
    let facts;
    try {
      const body = await readBuffer(stored.body, this.environment.STORAGE_MAX_UPLOAD_BYTES);
      facts = await inspectAssetContent({
        body,
        filename: object.originalName,
        declaredContentType: object.declaredContentType,
        declaredSizeBytes: object.declaredSizeBytes,
        maxBytes: this.environment.STORAGE_MAX_UPLOAD_BYTES,
      });
    } catch (error) {
      await this.failUpload(object, 'STORAGE_CONTENT_REJECTED', context);
      throw error;
    }
    return this.finalize(objectId, facts, context);
  }

  private async finalize(
    objectId: string,
    facts: Awaited<ReturnType<typeof inspectAssetContent>>,
    context: ActorContext,
  ) {
    const previousObjectId = await this.database.transaction(async (transaction) => {
      const object = await this.objects.lock(objectId, transaction);
      if (!object) throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', '上传对象不存在');
      if (object.status === 'ready') return null;
      if (object.status !== 'pending' || object.uploadExpiresAt.getTime() <= Date.now()) {
        this.uploadStateConflict();
      }
      const asset = await this.assets.lock(object.assetId, transaction);
      if (!asset || asset.pendingVersion !== object.version || asset.status === 'deleted') {
        this.uploadStateConflict();
      }
      const previous = asset.currentVersion
        ? (await this.objects.versions(asset.id, transaction)).find(
            (candidate) => candidate.version === asset.currentVersion,
          )
        : null;
      const ready = await this.objects.markReady(object.id, facts, new Date(), transaction);
      if (!ready) this.uploadStateConflict();
      const activated = await this.assets.activate(
        asset.id,
        object.version,
        facts.mediaKind,
        new Date(),
        transaction,
      );
      if (!activated) this.uploadStateConflict();
      if (previous) {
        const deletion = await this.objects.markSuperseded(previous.id, new Date(), transaction);
        if (deletion) {
          await this.jobs.enqueue(
            {
              type: 'storage.delete-object',
              payload: { objectId: deletion.id },
              deduplicationKey: `storage:delete:${deletion.id}`,
            },
            transaction,
          );
        }
      }
      await this.audit.record(
        {
          ...context,
          category: 'business',
          action: previous ? 'storage.asset.replaced' : 'storage.asset.created',
          resourceType: 'storage.asset',
          resourceId: asset.id,
          metadata: {
            version: object.version,
            provider: object.provider,
            contentType: facts.contentType,
            sizeBytes: facts.sizeBytes,
            checksumSha256: facts.checksumSha256,
          },
        },
        transaction,
      );
      return previous?.id ?? null;
    });
    void previousObjectId;
    const object = await this.objects.find(objectId);
    if (!object) throw new Error('Storage object disappeared after finalize');
    return this.library.get(object.assetId);
  }

  private async requirePending(id: string) {
    const object = await this.objects.find(id);
    if (!object) throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND', '上传对象不存在');
    if (object.status !== 'pending' || object.uploadExpiresAt.getTime() <= Date.now()) {
      this.uploadStateConflict();
    }
    return object;
  }

  private async failUpload(
    object: NonNullable<Awaited<ReturnType<StorageObjectRepository['find']>>>,
    code: string,
    context: ActorContext,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const locked = await this.objects.lock(object.id, transaction);
      if (!locked || locked.status !== 'pending') return;
      const failed = await this.objects.markFailed(object.id, code, new Date(), transaction);
      if (failed) {
        await this.assets.failPending(object.assetId, object.version, new Date(), transaction);
        await this.jobs.enqueue(
          {
            type: 'storage.delete-rejected-object',
            payload: { objectId: object.id },
            deduplicationKey: `storage:delete-rejected:${object.id}`,
          },
          transaction,
        );
        await this.audit.record(
          {
            ...context,
            category: 'business',
            action: 'storage.asset.upload-rejected',
            resourceType: 'storage.asset',
            resourceId: object.assetId,
            outcome: 'failure',
            metadata: { version: object.version, provider: object.provider, code },
          },
          transaction,
        );
      }
    });
  }

  private stateConflict(): never {
    throw new ApiError(409, 'STORAGE_ASSET_STATE_CHANGED', '素材状态或版本已变化，请刷新后重试');
  }

  private uploadStateConflict(): never {
    throw new ApiError(409, 'STORAGE_UPLOAD_STATE_CHANGED', '上传状态已变化或预授权已过期');
  }
}

function displayName(filename: string): string {
  const extension = extname(filename);
  return filename.slice(0, filename.length - extension.length) || filename;
}

function objectKey(assetId: string, version: number, objectId: string): string {
  return `assets/${assetId}/v${version}/${objectId}`;
}

async function readBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new ApiError(413, 'STORAGE_FILE_TOO_LARGE', '文件超过系统允许的大小');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}
