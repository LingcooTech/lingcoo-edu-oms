import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { S3StorageProvider } from '../src/modules/storage/infrastructure/s3-storage.provider.js';

describe('S3 storage provider', () => {
  it('uses private provider operations and a bounded presigned PUT', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: Readable.from(Buffer.from('content')),
          ContentLength: 7,
          ContentType: 'text/plain',
        };
      }
      return {};
    });
    let signedCommand: unknown;
    const signedUrl = vi.fn(async (_client: S3Client, command: unknown) => {
      signedCommand = command;
      return 'https://storage.example/signed';
    }) as unknown as typeof getSignedUrl;
    const provider = new S3StorageProvider(
      async () => ({
        region: 'us-east-1',
        endpoint: 'https://s3.example',
        bucket: 'private-assets',
        forcePathStyle: true,
        credentials: { accessKeyId: 'access', secretAccessKey: 'secret' },
      }),
      { client: () => ({ send }) as unknown as S3Client, signedUrl },
    );

    const expiresAt = new Date(Date.now() + 300_000);
    const authorization = await provider.authorizeUpload({
      objectKey: 'assets/a/v1/o',
      contentType: 'text/plain',
      expiresAt,
    });
    expect(authorization).toMatchObject({
      method: 'PUT',
      url: 'https://storage.example/signed',
      headers: { 'content-type': 'text/plain' },
    });
    expect(signedCommand).toBeInstanceOf(PutObjectCommand);
    expect((signedCommand as PutObjectCommand).input).toMatchObject({
      Bucket: 'private-assets',
      Key: 'assets/a/v1/o',
      ContentType: 'text/plain',
    });

    await expect(provider.read('private-assets', 'assets/a/v1/o')).resolves.toMatchObject({
      contentLength: 7,
      contentType: 'text/plain',
    });
    await provider.delete('private-assets', 'assets/a/v1/o');
    await provider.test(new AbortController().signal);
    expect(send.mock.calls.some(([item]) => item instanceof GetObjectCommand)).toBe(true);
    expect(send.mock.calls.some(([item]) => item instanceof DeleteObjectCommand)).toBe(true);
    expect(send.mock.calls.some(([item]) => item instanceof HeadBucketCommand)).toBe(true);
  });
});
