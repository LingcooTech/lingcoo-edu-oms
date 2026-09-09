import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';

import { describe, expect, it, vi } from 'vitest';

import { S3StorageProvider } from '../src/modules/storage/infrastructure/s3-storage.provider.js';

describe('S3 storage provider project configuration', () => {
  it('passes Qiniu Kodo S3 endpoint, region, credentials, and path style to the S3 client factory', async () => {
    const send = vi.fn(async (_command: unknown, _options?: unknown) => ({}));
    let receivedConfiguration: unknown;
    const provider = new S3StorageProvider(
      async () => ({
        region: 'cn-east-1',
        endpoint: 'https://s3.cn-east-1.qiniucs.com',
        bucket: 'lingcoo-assets',
        forcePathStyle: false,
        credentials: { accessKeyId: 'qiniu-ak-test', secretAccessKey: 'qiniu-sk-test' },
      }),
      {
        client: (configuration) => {
          receivedConfiguration = configuration;
          return { send } as unknown as S3Client;
        },
      },
    );

    await provider.test(new AbortController().signal);

    expect(receivedConfiguration).toEqual({
      region: 'cn-east-1',
      endpoint: 'https://s3.cn-east-1.qiniucs.com',
      bucket: 'lingcoo-assets',
      forcePathStyle: false,
      credentials: { accessKeyId: 'qiniu-ak-test', secretAccessKey: 'qiniu-sk-test' },
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
    expect((send.mock.calls[0]?.[0] as HeadBucketCommand).input).toMatchObject({
      Bucket: 'lingcoo-assets',
    });
  });

  it('preserves an explicit path-style setting for compatible endpoints', async () => {
    let receivedForcePathStyle: boolean | undefined;
    const provider = new S3StorageProvider(
      async () => ({
        region: 'cn-east-1',
        endpoint: 'https://s3.cn-east-1.qiniucs.com',
        bucket: 'lingcoo-assets',
        forcePathStyle: true,
        credentials: { accessKeyId: 'qiniu-ak-test', secretAccessKey: 'qiniu-sk-test' },
      }),
      {
        client: ({ forcePathStyle }) => {
          receivedForcePathStyle = forcePathStyle;
          return { send: vi.fn(async () => ({})) } as unknown as S3Client;
        },
      },
    );

    await provider.test(new AbortController().signal);

    expect(receivedForcePathStyle).toBe(true);
  });
});
