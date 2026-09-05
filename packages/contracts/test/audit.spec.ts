import { describe, expect, it } from 'vitest';

import { auditEventPageSchema, auditQuerySchema } from '../src/audit.js';

describe('audit contracts', () => {
  it('normalizes pagination and accepts the supported filters', () => {
    expect(
      auditQuerySchema.parse({
        page: '2',
        pageSize: '50',
        actorType: 'user',
        action: 'access.role.created',
      }),
    ).toMatchObject({ page: 2, pageSize: 50, actorType: 'user' });
  });

  it('requires complete immutable event representations', () => {
    expect(() =>
      auditEventPageSchema.parse({
        items: [{ id: crypto.randomUUID(), action: 'access.role.created' }],
        page: 1,
        pageSize: 20,
        total: 1,
      }),
    ).toThrow();
  });

  it('rejects an inverted time range', () => {
    expect(() =>
      auditQuerySchema.parse({
        from: '2026-08-31T00:00:00.000Z',
        to: '2026-08-30T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
