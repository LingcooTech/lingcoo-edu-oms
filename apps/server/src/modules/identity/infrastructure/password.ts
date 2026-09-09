import { scrypt, timingSafeEqual } from 'node:crypto';
import { verifyPassword as verifyCurrentPassword } from '@lingcoo-tech/security/password';

export { hashPassword, needsPasswordRehash } from '@lingcoo-tech/security/password';

/** The legacy Edu utility passed the hex salt as UTF-8 text, not decoded bytes. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (encoded.startsWith('scrypt:v1:')) return verifyCurrentPassword(password, encoded);
  const legacy = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!legacy) return false;
  const expected = Buffer.from(legacy[2]!, 'hex');
  return new Promise((resolve) => {
    scrypt(
      password,
      legacy[1]!,
      64,
      { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 },
      (error, actual) => {
        resolve(!error && actual.length === expected.length && timingSafeEqual(actual, expected));
      },
    );
  });
}
