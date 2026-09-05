import { describe, expect, it, vi } from 'vitest';

import { createOutboxApi } from '../src/outbox.js';

describe('outbox API client', () => {
  it('builds list and replay requests', async () => {
    const request = vi.fn(async () => ({}));
    const api = createOutboxApi({ request } as never);
    await api.list({ status: 'dead', page: 2 });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('status=dead') }),
    );
    await api.replay('2f54dd84-ca70-4d17-bf80-ffaca336113c');
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'POST', path: expect.stringContaining('/actions/replay') }),
    );
  });
});
