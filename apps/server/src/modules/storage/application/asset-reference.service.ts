import { ApiError } from '@lingcoo-tech/http';

import type { DatabaseExecutor, DatabaseHandle } from '../../../database/database.js';
import type { AssetReferenceInput, AssetReferencePolicy } from '../domain/model.js';
import { AssetRepository } from '../infrastructure/persistence/asset.repository.js';

const OWNER_PATTERN = /^[a-z][a-z0-9._-]{0,119}$/;

export class AssetReferenceService {
  constructor(
    private readonly database: DatabaseHandle,
    private readonly assets: AssetRepository,
  ) {}

  async set(
    input: AssetReferenceInput,
    executor: DatabaseExecutor = this.database.db,
    policy: AssetReferencePolicy = {},
  ) {
    assertReference(input.ownerType, input.ownerId, input.field);
    if (!input.assetId) {
      await this.assets.clearReference(input.ownerType, input.ownerId, input.field, executor);
      return;
    }
    const asset = await this.assets.find(input.assetId, executor);
    if (!asset || asset.status !== 'active' || asset.deletedAt) {
      throw new ApiError(409, 'STORAGE_ASSET_NOT_REFERENCEABLE', '素材不存在或尚未上传完成');
    }
    if (policy.mediaKind && asset.mediaKind !== policy.mediaKind) {
      throw new ApiError(409, 'STORAGE_ASSET_MEDIA_KIND_MISMATCH', '素材类型不符合业务用途');
    }
    if (policy.visibility && asset.visibility !== policy.visibility) {
      throw new ApiError(409, 'STORAGE_ASSET_VISIBILITY_MISMATCH', '素材可见性不符合业务用途');
    }
    await this.assets.setReference(
      {
        assetId: input.assetId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        field: input.field,
        createdBy: input.createdBy,
      },
      executor,
    );
  }

  async get(
    ownerType: string,
    ownerId: string,
    field: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<string | null> {
    assertReference(ownerType, ownerId, field);
    return (await this.assets.findReference(ownerType, ownerId, field, executor))?.assetId ?? null;
  }

  async getMany(
    ownerType: string,
    ownerId: string,
    fields: string[],
    executor: DatabaseExecutor = this.database.db,
  ): Promise<Record<string, string | null>> {
    for (const field of fields) assertReference(ownerType, ownerId, field);
    const records = await this.assets.findReferences(ownerType, ownerId, fields, executor);
    const result: Record<string, string | null> = Object.fromEntries(
      fields.map((field) => [field, null]),
    );
    for (const record of records) result[record.field] = record.assetId;
    return result;
  }
}

function assertReference(ownerType: string, ownerId: string, field: string): void {
  if (!OWNER_PATTERN.test(ownerType) || !OWNER_PATTERN.test(field)) {
    throw new Error('Asset reference owner type or field is invalid');
  }
  const hasControlCharacter = [...ownerId].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (!ownerId.trim() || ownerId.length > 200 || hasControlCharacter) {
    throw new Error('Asset reference owner id is invalid');
  }
}
