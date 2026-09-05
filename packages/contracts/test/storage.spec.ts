import { describe, expect, it } from 'vitest';

import {
  assetSummarySchema,
  authorizeAssetUploadRequestSchema,
  storageUploadAuthorizationSchema,
} from '../src/storage.js';

const id = '2f54dd84-ca70-4d17-bf80-ffaca336113c';
const now = '2026-09-01T00:00:00.000Z';

describe('storage contracts', () => {
  it('validates upload declarations and rejects unsafe names or unsupported sizes', () => {
    expect(
      authorizeAssetUploadRequestSchema.parse({
        filename: '课程封面.png',
        contentType: 'IMAGE/PNG',
        sizeBytes: 1024,
      }),
    ).toMatchObject({ contentType: 'image/png', visibility: 'private' });
    expect(() =>
      authorizeAssetUploadRequestSchema.parse({
        filename: 'bad\u0000.png',
        contentType: 'image/png',
        sizeBytes: 1,
      }),
    ).toThrow();
    expect(() =>
      authorizeAssetUploadRequestSchema.parse({
        filename: 'large.pdf',
        contentType: 'application/pdf',
        sizeBytes: 101 * 1_024 * 1_024,
      }),
    ).toThrow();
  });

  it('exposes stable application URLs without provider internals', () => {
    const asset = assetSummarySchema.parse({
      id,
      status: 'active',
      visibility: 'public',
      mediaKind: 'image',
      displayName: 'Logo',
      altText: null,
      currentVersion: 1,
      revision: 2,
      provider: 's3',
      originalName: 'logo.png',
      contentType: 'image/png',
      extension: 'png',
      sizeBytes: 100,
      checksumSha256: 'a'.repeat(64),
      referenceCount: 1,
      contentUrl: `/api/storage/assets/${id}/content`,
      publicUrl: `/api/assets/public/${id}/content`,
      createdBy: id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      bucket: 'private-bucket',
      objectKey: 'secret/key',
    });
    expect(asset).not.toHaveProperty('bucket');
    expect(asset).not.toHaveProperty('objectKey');
  });

  it('requires completed authorizations to omit an upload target', () => {
    expect(
      storageUploadAuthorizationSchema.parse({
        assetId: id,
        objectId: id,
        assetRevision: 2,
        completed: true,
        upload: null,
      }),
    ).toMatchObject({ completed: true });
  });
});
