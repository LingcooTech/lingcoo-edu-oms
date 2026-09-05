import { describe, expect, it } from 'vitest';

import {
  hashIdempotencyKey,
  hashIdempotencyRequest,
  previewIdempotencyKey,
} from '../src/modules/idempotency/domain/request-hash.js';

describe('idempotency hashing', () => {
  it('canonicalizes object keys while preserving array order and null semantics', () => {
    expect(hashIdempotencyRequest({ b: 2, a: 1 })).toBe(hashIdempotencyRequest({ a: 1, b: 2 }));
    expect(hashIdempotencyRequest({ values: [1, 2] })).not.toBe(
      hashIdempotencyRequest({ values: [2, 1] }),
    );
    expect(hashIdempotencyRequest({ value: null })).not.toBe(hashIdempotencyRequest({}));
  });

  it('rejects non-JSON and cyclic input', () => {
    expect(() => hashIdempotencyRequest({ value: undefined })).toThrow(
      '幂等请求快照必须是可确定序列化的 JSON 值',
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => hashIdempotencyRequest(cyclic)).toThrow();
    expect(() => hashIdempotencyRequest(new Date())).toThrow();
  });

  it('stores only a key hash and a non-reversible short preview', () => {
    const key = 'customer-visible-idempotency-key';
    expect(hashIdempotencyKey(key)).toMatch(/^[a-f0-9]{64}$/);
    expect(previewIdempotencyKey(key)).not.toContain(key);
    expect(previewIdempotencyKey(key).length).toBeLessThanOrEqual(32);
    expect(previewIdempotencyKey('abc')).not.toContain('abc');
  });
});
