import { describe, expect, it, vi } from 'vitest';

import { createStorageApi } from '../src/storage.js';

const id = '2f54dd84-ca70-4d17-bf80-ffaca336113c';

describe('storage API client', () => {
  it('builds library and lifecycle requests', async () => {
    const request = vi.fn(async () => ({
      assetId: id,
      objectId: id,
      assetRevision: 1,
      completed: false,
      upload: {
        method: 'POST',
        url: `/api/storage/uploads/${id}/content`,
        headers: {},
        expiresAt: '2026-09-01T01:00:00.000Z',
      },
    }));
    const uploadRaw = vi.fn(async () => undefined);
    const api = createStorageApi({ request, uploadRaw } as never);
    await api.list({ mediaKind: 'image', search: 'logo' });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/mediaKind=image/) }),
    );
    await api.update(id, {
      expectedRevision: 2,
      displayName: 'Logo',
      altText: null,
      visibility: 'public',
    });
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'PUT', path: `/api/storage/assets/${id}` }),
    );
    await api.delete(id, 3);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'DELETE', body: { expectedRevision: 3 } }),
    );
  });

  it('uses multipart for a local upload after authorization', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        assetId: id,
        objectId: id,
        assetRevision: 1,
        completed: false,
        upload: {
          method: 'POST',
          url: `/api/storage/uploads/${id}/content`,
          headers: {},
          expiresAt: '2026-09-01T01:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({ id });
    const api = createStorageApi({ request, uploadRaw: vi.fn() } as never);
    await api.upload(new File(['hello'], 'hello.txt', { type: 'text/plain' }));
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });
});
