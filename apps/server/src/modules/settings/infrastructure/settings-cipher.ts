import {
  decryptJson,
  encryptJson,
  EncryptionError,
  type EncryptedEnvelope,
} from '@lingcoo-tech/crypto';
import { ApiError } from '@lingcoo-tech/http';

export class SettingsCipher {
  constructor(
    private readonly currentId: string,
    private readonly keys: Readonly<Record<string, string>>,
  ) {}

  currentKeyId(): string {
    return this.currentId;
  }

  encrypt(value: unknown): { encryptedValue: EncryptedEnvelope; encryptionKeyId: string } {
    return {
      encryptedValue: encryptJson(value, this.secret(this.currentId)),
      encryptionKeyId: this.currentId,
    };
  }

  decrypt<T>(value: unknown, encryptionKeyId: string): T {
    try {
      return decryptJson<T>(value, this.secret(encryptionKeyId));
    } catch (error) {
      if (error instanceof EncryptionError) {
        throw new ApiError(500, 'SETTING_DECRYPTION_FAILED', '敏感设置无法解密');
      }
      throw error;
    }
  }

  private secret(keyId: string): string {
    const secret = this.keys[keyId];
    if (!secret) throw new ApiError(500, 'SETTING_KEY_UNAVAILABLE', '敏感设置密钥不可用');
    return secret;
  }
}
