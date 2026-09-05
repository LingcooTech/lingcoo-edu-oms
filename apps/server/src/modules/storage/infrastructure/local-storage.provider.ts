import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { ObjectStorageProvider } from '../domain/model.js';

export class LocalStorageProvider implements ObjectStorageProvider {
  readonly provider = 'local' as const;

  constructor(private readonly root: string) {}

  async bucket(): Promise<string> {
    return 'local';
  }

  async authorizeUpload(input: { objectId: string; expiresAt: Date }) {
    return {
      method: 'POST' as const,
      url: `/api/storage/uploads/${input.objectId}/content`,
      headers: { accept: 'application/json' },
      expiresAt: input.expiresAt,
    };
  }

  async write(objectKey: string, content: Buffer): Promise<void> {
    const path = this.path(objectKey);
    const temporary = `${path}.${crypto.randomUUID()}.upload`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async read(_bucket: string, objectKey: string) {
    try {
      const path = this.path(objectKey);
      const information = await stat(path);
      return { body: createReadStream(path), contentLength: information.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(_bucket: string, objectKey: string): Promise<void> {
    await rm(this.path(objectKey), { force: true });
  }

  async test(signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw signal.reason;
    const root = resolve(this.root);
    await mkdir(root, { recursive: true });
    await stat(root);
  }

  private path(objectKey: string): string {
    const root = resolve(this.root);
    const path = resolve(root, objectKey);
    if (path === root || !path.startsWith(`${root}${sep}`)) throw new Error('Unsafe storage key');
    return path;
  }
}
