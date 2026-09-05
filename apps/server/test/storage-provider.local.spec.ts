import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalStorageProvider } from '../src/modules/storage/infrastructure/local-storage.provider.js';

describe('local storage provider', () => {
  it('writes atomically, reads, deletes and blocks traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'storage-provider-'));
    const provider = new LocalStorageProvider(root);
    try {
      await provider.write('assets/a/v1/object', Buffer.from('content'));
      expect(await readFile(join(root, 'assets/a/v1/object'), 'utf8')).toBe('content');
      const stored = await provider.read('local', 'assets/a/v1/object');
      expect(stored?.contentLength).toBe(7);
      await expect(provider.write('../escape', Buffer.from('bad'))).rejects.toThrow(
        'Unsafe storage key',
      );
      await provider.delete('local', 'assets/a/v1/object');
      await expect(provider.read('local', 'assets/a/v1/object')).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
