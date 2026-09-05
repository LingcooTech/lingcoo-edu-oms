import {
  decryptJson,
  encryptJson,
  EncryptionError,
  type EncryptedEnvelope,
} from '@lingcoo-tech/crypto';
import { ApiError } from '@lingcoo-tech/http';

export interface StoredMailEnvelope {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class MailCipher {
  constructor(
    private readonly currentId: string,
    private readonly keys: Readonly<Record<string, string>>,
  ) {}
  encrypt(value: StoredMailEnvelope): {
    encryptedEnvelope: EncryptedEnvelope;
    encryptionKeyId: string;
  } {
    return {
      encryptedEnvelope: encryptJson(value, this.secret(this.currentId)),
      encryptionKeyId: this.currentId,
    };
  }
  decrypt(value: unknown, keyId: string): StoredMailEnvelope {
    try {
      return decryptJson<StoredMailEnvelope>(value, this.secret(keyId));
    } catch (error) {
      if (error instanceof EncryptionError)
        throw new ApiError(500, 'MAIL_DECRYPTION_FAILED', '邮件投递内容无法解密');
      throw error;
    }
  }
  private secret(keyId: string): string {
    const secret = this.keys[keyId];
    if (!secret) throw new ApiError(500, 'MAIL_KEY_UNAVAILABLE', '邮件投递加密密钥不可用');
    return secret;
  }
}
