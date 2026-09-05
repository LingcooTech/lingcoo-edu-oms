import { createHash } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import type { z } from 'zod';

const MAX_EVENT_BYTES = 1024 * 1024;
const DEDUPLICATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:/-]*$/;

function canonicalize(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('cyclic payload');
    seen.add(value);
    const result = `[${value.map((item) => canonicalize(item, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('cyclic payload');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('non-plain object');
    seen.add(value);
    const record = value as Record<string, unknown>;
    const result = `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`)
      .join(',')}}`;
    seen.delete(value);
    return result;
  }
  throw new Error('unsupported value');
}

export function prepareOutboxPayload<TPayload>(schema: z.ZodType<TPayload>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(
      400,
      'OUTBOX_PAYLOAD_INVALID',
      'Outbox Event Payload 未通过注册 Schema 校验',
    );
  }
  let serialized: string;
  try {
    serialized = canonicalize(parsed.data, new Set());
  } catch {
    throw new ApiError(400, 'OUTBOX_PAYLOAD_INVALID', 'Outbox Event Payload 必须是稳定 JSON 值');
  }
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');
  if (sizeBytes > MAX_EVENT_BYTES) {
    throw new ApiError(413, 'OUTBOX_PAYLOAD_TOO_LARGE', 'Outbox Event Payload 不能超过 1 MiB');
  }
  const payload = JSON.parse(serialized) as unknown;
  if (!schema.safeParse(payload).success) {
    throw new ApiError(400, 'OUTBOX_PAYLOAD_NOT_STABLE', 'Outbox Payload 在 JSON 序列化后不稳定');
  }
  return {
    payload,
    hash: createHash('sha256').update(serialized).digest('hex'),
    sizeBytes,
  };
}

export function prepareOutboxDeduplicationKey(key: string | undefined) {
  if (key === undefined) return { hash: null, preview: null };
  const normalized = key.trim();
  if (!normalized || normalized.length > 200 || !DEDUPLICATION_KEY_PATTERN.test(normalized)) {
    throw new ApiError(400, 'OUTBOX_DEDUPLICATION_KEY_INVALID', 'Outbox 去重键格式无效');
  }
  const hash = createHash('sha256').update(normalized).digest('hex');
  return {
    hash,
    preview: `${normalized.length >= 8 ? normalized.slice(0, 4) : 'short'}…${hash.slice(0, 8)}`,
  };
}
