import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

import type { ObjectStorageProvider } from '../domain/model.js';

export interface S3StorageConfiguration {
  region: string;
  endpoint?: string;
  bucket: string;
  forcePathStyle: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export class S3StorageProvider implements ObjectStorageProvider {
  readonly provider = 's3' as const;

  constructor(
    private readonly configuration: () => Promise<S3StorageConfiguration>,
    private readonly dependencies: {
      client?: (configuration: S3StorageConfiguration) => S3Client;
      signedUrl?: typeof getSignedUrl;
    } = {},
  ) {}

  async bucket(): Promise<string> {
    return (await this.configuration()).bucket;
  }

  async authorizeUpload(input: { objectKey: string; contentType: string; expiresAt: Date }) {
    const configuration = await this.configuration();
    const expiresIn = Math.max(1, Math.floor((input.expiresAt.getTime() - Date.now()) / 1_000));
    const url = await (this.dependencies.signedUrl ?? getSignedUrl)(
      this.client(configuration),
      new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
      }),
      { expiresIn },
    );
    return {
      method: 'PUT' as const,
      url,
      headers: { 'content-type': input.contentType },
      expiresAt: input.expiresAt,
    };
  }

  async read(bucket: string, objectKey: string) {
    try {
      const output = await this.client(await this.configuration()).send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (!output.Body) return null;
      const body = output.Body as Readable;
      return {
        body,
        contentLength: output.ContentLength ?? 0,
        contentType: output.ContentType,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  async delete(bucket: string, objectKey: string): Promise<void> {
    await this.client(await this.configuration()).send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
  }

  async test(signal: AbortSignal): Promise<void> {
    const configuration = await this.configuration();
    await this.client(configuration).send(new HeadBucketCommand({ Bucket: configuration.bucket }), {
      abortSignal: signal,
    });
  }

  private client(configuration: S3StorageConfiguration): S3Client {
    if (this.dependencies.client) return this.dependencies.client(configuration);
    return new S3Client({
      region: configuration.region,
      endpoint: configuration.endpoint,
      forcePathStyle: configuration.forcePathStyle,
      credentials: configuration.credentials,
    });
  }
}
