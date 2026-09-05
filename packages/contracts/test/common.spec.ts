import { describe, expect, it } from 'vitest';

import { pageQuerySchema, pagedResponseSchema, readinessResponseSchema } from '../src/index.js';

describe('common contracts', () => {
  it('normalizes pagination defaults', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('creates typed paged response schemas', () => {
    const schema = pagedResponseSchema(readinessResponseSchema);
    expect(schema.safeParse({ items: [], page: 1, pageSize: 20, total: 0 }).success).toBe(true);
  });
});
