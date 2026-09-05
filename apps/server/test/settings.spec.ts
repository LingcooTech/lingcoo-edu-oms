import { describe, expect, it } from 'vitest';

import { SettingsCipher } from '../src/modules/settings/infrastructure/settings-cipher.js';

describe('settings cipher', () => {
  const oldSecret = 'old-settings-key-material-at-least-32-characters';
  const newSecret = 'new-settings-key-material-at-least-32-characters';

  it('uses the envelope key ID and reports unavailable old keys without exposing values', () => {
    const oldCipher = new SettingsCipher('old-v1', { 'old-v1': oldSecret });
    const encrypted = oldCipher.encrypt('sensitive-value');
    expect(oldCipher.decrypt(encrypted.encryptedValue, encrypted.encryptionKeyId)).toBe(
      'sensitive-value',
    );

    const newCipher = new SettingsCipher('new-v2', { 'new-v2': newSecret });
    expect(() => newCipher.decrypt(encrypted.encryptedValue, 'old-v1')).toThrow(
      '敏感设置密钥不可用',
    );
  });

  it('returns a stable safe error when an encrypted envelope is corrupted', () => {
    const cipher = new SettingsCipher('current', { current: newSecret });
    const encrypted = cipher.encrypt('sensitive-value');
    expect(() =>
      cipher.decrypt({ ...encrypted.encryptedValue, data: 'corrupted' }, 'current'),
    ).toThrow('敏感设置无法解密');
  });
});
