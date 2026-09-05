import type { Readable } from 'node:stream';

import type { AssetMediaKind, AssetVisibility, StorageProvider } from '@lingcoo-edu-oms/contracts';

export interface StoredObjectContent {
  body: Readable;
  contentLength: number;
  contentType?: string;
}

export interface UploadAuthorization {
  method: 'POST' | 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStorageProvider {
  readonly provider: StorageProvider;
  bucket(): Promise<string>;
  authorizeUpload(input: {
    objectId: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    expiresAt: Date;
  }): Promise<UploadAuthorization>;
  write?(objectKey: string, content: Buffer): Promise<void>;
  read(bucket: string, objectKey: string): Promise<StoredObjectContent | null>;
  delete(bucket: string, objectKey: string): Promise<void>;
  test(signal: AbortSignal): Promise<void>;
}

export interface StorageProviderResolver {
  current(): Promise<ObjectStorageProvider>;
  forProvider(provider: StorageProvider): ObjectStorageProvider;
}

export interface InspectedAssetContent {
  contentType: string;
  extension: string;
  mediaKind: AssetMediaKind;
  sizeBytes: number;
  checksumSha256: string;
}

export interface AssetReferenceInput {
  ownerType: string;
  ownerId: string;
  field: string;
  assetId: string | null;
  createdBy?: string | null;
}

export interface AssetReferencePolicy {
  mediaKind?: AssetMediaKind;
  visibility?: AssetVisibility;
}

export interface ReadableAsset {
  id: string;
  visibility: AssetVisibility;
  displayName: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  body: Readable;
}
