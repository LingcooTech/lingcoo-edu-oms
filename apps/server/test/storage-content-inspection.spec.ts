import { describe, expect, it } from 'vitest';

import {
  assertDeclaredAssetType,
  inspectAssetContent,
} from '../src/modules/storage/domain/content-inspection.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4FQAAAAASUVORK5CYII=',
  'base64',
);

describe('storage content inspection', () => {
  it('derives immutable image facts from content', async () => {
    await expect(
      inspectAssetContent({
        body: png,
        filename: 'pixel.png',
        declaredContentType: 'image/png',
        declaredSizeBytes: png.length,
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ contentType: 'image/png', extension: 'png', mediaKind: 'image' });
  });

  it('accepts UTF-8 text and rejects binary or forged extensions', async () => {
    const text = Buffer.from('姓名,课程\n张三,数学\n');
    await expect(
      inspectAssetContent({
        body: text,
        filename: 'students.csv',
        declaredContentType: 'text/csv',
        declaredSizeBytes: text.length,
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ mediaKind: 'text', extension: 'csv' });
    await expect(
      inspectAssetContent({
        body: png,
        filename: 'forged.pdf',
        declaredContentType: 'application/pdf',
        declaredSizeBytes: png.length,
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_CONTENT_TYPE_REJECTED' });
    const binary = Buffer.from([0, 1, 2, 3]);
    await expect(
      inspectAssetContent({
        body: binary,
        filename: 'unsafe.txt',
        declaredContentType: 'text/plain',
        declaredSizeBytes: binary.length,
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_CONTENT_TYPE_REJECTED' });
  });

  it('rejects size changes and configured limit violations', async () => {
    expect(() => assertDeclaredAssetType('image/svg+xml')).toThrowError(
      expect.objectContaining({ code: 'STORAGE_CONTENT_TYPE_REJECTED' }),
    );
    await expect(
      inspectAssetContent({
        body: png,
        filename: 'pixel.png',
        declaredContentType: 'image/png',
        declaredSizeBytes: png.length + 1,
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_SIZE_MISMATCH' });
  });
});
