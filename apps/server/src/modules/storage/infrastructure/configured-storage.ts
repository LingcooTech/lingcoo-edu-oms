import type { AppEnvironment } from '../../../config/environment.js';
import type { SettingsReader } from '../../settings/public.js';
import type { ObjectStorageProvider, StorageProviderResolver } from '../domain/model.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { S3StorageProvider, type S3StorageConfiguration } from './s3-storage.provider.js';

export class ConfiguredStorageProviderResolver implements StorageProviderResolver {
  private readonly providers: Map<string, ObjectStorageProvider>;

  constructor(
    environment: AppEnvironment,
    private readonly settings: SettingsReader,
  ) {
    const local = new LocalStorageProvider(environment.STORAGE_LOCAL_ROOT);
    const s3 = new S3StorageProvider(() => this.s3Configuration());
    this.providers = new Map<string, ObjectStorageProvider>([
      [local.provider, local],
      [s3.provider, s3],
    ]);
  }

  async current(): Promise<ObjectStorageProvider> {
    const provider = (await this.settings.getValue<'local' | 's3'>('storage.provider')) ?? 'local';
    return this.forProvider(provider);
  }

  forProvider(provider: 'local' | 's3'): ObjectStorageProvider {
    const result = this.providers.get(provider);
    if (!result) throw new Error(`Storage provider is not registered: ${provider}`);
    return result;
  }

  private async s3Configuration(): Promise<S3StorageConfiguration> {
    const [region, endpoint, bucket, accessKeyId, secretAccessKey, forcePathStyle] =
      await Promise.all([
        this.settings.getValue<string>('storage.s3-region'),
        this.settings.getValue<string>('storage.s3-endpoint'),
        this.settings.getValue<string>('storage.s3-bucket'),
        this.settings.getValue<string>('storage.s3-access-key'),
        this.settings.getValue<string>('storage.s3-secret-key'),
        this.settings.getValue<boolean>('storage.s3-force-path-style'),
      ]);
    if (!region || !bucket) throw new Error('S3 region and bucket must be configured');
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
      throw new Error('S3 access key and secret key must be configured together');
    }
    return {
      region,
      endpoint,
      bucket,
      forcePathStyle: forcePathStyle ?? false,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    };
  }
}

export function createStorageConnectionTester(resolver: StorageProviderResolver) {
  return {
    key: 'storage.connection',
    group: 'storage',
    label: '测试存储连接',
    description: '验证当前驱动的目录或 Bucket 是否可访问。',
    requiredSettings: ['storage.provider'],
    timeoutMs: 10_000,
    async test(_values: ReadonlyMap<string, unknown>, signal: AbortSignal) {
      const provider = await resolver.current();
      await provider.test(signal);
      return { ok: true, message: `${provider.provider} 存储连接正常` };
    },
  };
}
