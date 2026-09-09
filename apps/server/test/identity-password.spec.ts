import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from '../src/modules/identity/infrastructure/password.js';

// Matches old src/lib/password.ts exactly: the random hex salt is passed as text.
export function legacyEduHash(password: string): string {
  const salt = '00112233445566778899aabbccddeeff';
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

describe('legacy Edu password compatibility', () => {
  it('verifies actual legacy text-salt hashes including six digit provisioning passwords', async () => {
    for (const password of ['admin123456', '138000', '密码🙂legacy']) {
      const encoded = legacyEduHash(password);
      expect(await verifyPassword(password, encoded)).toBe(true);
      expect(await verifyPassword(`${password}x`, encoded)).toBe(false);
      expect(needsPasswordRehash(encoded)).toBe(true);
    }
  });
  it('verifies current hashes and rejects malformed legacy records', async () => {
    const current = await hashPassword('current-secure-password');
    expect(await verifyPassword('current-secure-password', current)).toBe(true);
    expect(needsPasswordRehash(current)).toBe(false);
    for (const malformed of [
      '',
      'scrypt:bad:bad',
      `${legacyEduHash('password')}:extra`,
      'bcrypt:invalid',
    ]) {
      expect(await verifyPassword('password', malformed)).toBe(false);
    }
  });
});
