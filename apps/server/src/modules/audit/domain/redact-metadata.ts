const SENSITIVE_KEY =
  /(?:password|passwd|secret|token|authorization|cookie|credential|private.?key|api.?key|card.?number|cvv|cvc)/i;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 2_000;
const MAX_SERIALIZED_BYTES = 64 * 1_024;
const REDACTED = '[REDACTED]';

function sanitize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}[TRUNCATED]`
      : value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'function') {
    return null;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return `[BINARY:${value.byteLength}]`;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitize(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_OBJECT_KEYS)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1, seen),
      ]),
  );
}

export function redactAuditMetadata(
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  const redacted = sanitize(metadata, 0, new WeakSet()) as Record<string, unknown>;
  return Buffer.byteLength(JSON.stringify(redacted), 'utf8') <= MAX_SERIALIZED_BYTES
    ? redacted
    : { truncated: '[MAX_SIZE]' };
}

export function redactAuditChanges(changes: AuditChange[]): AuditChange[] {
  return changes.map((change) =>
    SENSITIVE_KEY.test(change.field)
      ? { field: change.field, before: REDACTED, after: REDACTED }
      : {
          field: change.field,
          before: sanitize(change.before, 0, new WeakSet()),
          after: sanitize(change.after, 0, new WeakSet()),
        },
  );
}
import type { AuditChange } from '@lingcoo-edu-oms/contracts';
