import { createHash } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';

const MAX_CANONICAL_REQUEST_BYTES = 1024 * 1024;

function canonicalize(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('cyclic request');
    seen.add(value);
    const result = `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('cyclic request');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('request must contain plain JSON objects');
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`)
      .join(',')}}`;
    seen.delete(value);
    return result;
  }
  throw new Error(`unsupported request value: ${typeof value}`);
}

export function hashIdempotencyRequest(request: unknown): string {
  let canonical: string;
  try {
    canonical = canonicalize(request, new Set());
  } catch {
    throw new ApiError(
      400,
      'IDEMPOTENCY_REQUEST_INVALID',
      '幂等请求快照必须是可确定序列化的 JSON 值',
    );
  }
  if (Buffer.byteLength(canonical, 'utf8') > MAX_CANONICAL_REQUEST_BYTES) {
    throw new ApiError(413, 'IDEMPOTENCY_REQUEST_TOO_LARGE', '幂等请求快照不能超过 1 MiB');
  }
  return createHash('sha256').update(canonical).digest('hex');
}

export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function previewIdempotencyKey(key: string): string {
  const prefix = key.length >= 8 ? key.slice(0, 4) : 'short';
  return `${prefix}…${hashIdempotencyKey(key).slice(0, 8)}`;
}
