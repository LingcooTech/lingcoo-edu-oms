import type { AssetDetail, AssetSummary } from '@lingcoo-edu-oms/contracts';

import type { AssetRepository } from '../infrastructure/persistence/asset.repository.js';
import type { StorageObjectRepository } from '../infrastructure/persistence/storage-object.repository.js';

type Asset = NonNullable<Awaited<ReturnType<AssetRepository['find']>>>;
type ObjectRecord = NonNullable<Awaited<ReturnType<StorageObjectRepository['find']>>>;

export function toAssetSummary(
  asset: Asset,
  object: ObjectRecord | null,
  referenceCount: number,
): AssetSummary {
  const ready = object && ['ready', 'superseded', 'deletion_pending'].includes(object.status);
  const active = asset.status === 'active' && ready;
  return {
    id: asset.id,
    status: asset.status,
    visibility: asset.visibility,
    mediaKind: asset.mediaKind,
    displayName: asset.displayName,
    altText: asset.altText,
    currentVersion: asset.currentVersion,
    revision: asset.revision,
    provider: object?.provider ?? null,
    originalName: object?.originalName ?? null,
    contentType: object?.contentType ?? null,
    extension: object?.extension ?? null,
    sizeBytes: object?.sizeBytes ?? null,
    checksumSha256: object?.checksumSha256 ?? null,
    referenceCount,
    contentUrl: active ? `/api/storage/assets/${asset.id}/content` : null,
    publicUrl:
      active && asset.visibility === 'public' ? `/api/assets/public/${asset.id}/content` : null,
    createdBy: asset.createdBy,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deletedAt: asset.deletedAt?.toISOString() ?? null,
  };
}

export function toAssetDetail(summary: AssetSummary, versions: ObjectRecord[]): AssetDetail {
  return {
    ...summary,
    versions: versions.map((object) => ({
      id: object.id,
      version: object.version,
      provider: object.provider,
      status: object.status,
      originalName: object.originalName,
      contentType: object.contentType,
      extension: object.extension,
      sizeBytes: object.sizeBytes,
      checksumSha256: object.checksumSha256,
      createdAt: object.createdAt.toISOString(),
      readyAt: object.readyAt?.toISOString() ?? null,
      deletedAt: object.deletedAt?.toISOString() ?? null,
    })),
  };
}
