import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const ARTIFACT_FORMAT = 'lingcoo.identity.phase1.encrypted.v2';

function assertSourceShape(source) {
  if (
    !source ||
    typeof source !== 'object' ||
    !Array.isArray(source.accounts) ||
    !Array.isArray(source.roleAssignments) ||
    !Array.isArray(source.wechatIdentities) ||
    !/^[0-9a-f]{16}$/.test(source.metadata?.sourceDatabaseFingerprint ?? '')
  ) {
    throw new Error('Encrypted source artifact has an invalid phase 1 payload');
  }
  return source;
}

function keyFromPassphrase(passphrase, salt) {
  if (!passphrase || passphrase.length < 16) {
    throw new Error('MIGRATION_EXPORT_KEY must contain at least 16 characters');
  }
  return scryptSync(passphrase, salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
}

export async function writeEncryptedSourceArtifact(path, source, passphrase) {
  assertSourceShape(source);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = keyFromPassphrase(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(source), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const artifact = {
    format: ARTIFACT_FORMAT,
    kdf: 'scrypt-n16384-r8-p1',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
  await writeFile(path, `${JSON.stringify(artifact)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function readEncryptedSourceArtifact(path, passphrase) {
  const artifact = JSON.parse(await readFile(path, 'utf8'));
  if (
    artifact.format !== ARTIFACT_FORMAT ||
    artifact.kdf !== 'scrypt-n16384-r8-p1' ||
    artifact.cipher !== 'aes-256-gcm'
  ) {
    throw new Error('Unsupported migration source artifact format');
  }
  const salt = Buffer.from(artifact.salt, 'base64url');
  const iv = Buffer.from(artifact.iv, 'base64url');
  const tag = Buffer.from(artifact.tag, 'base64url');
  const ciphertext = Buffer.from(artifact.ciphertext, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', keyFromPassphrase(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return assertSourceShape(
      JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')),
    );
  } catch {
    throw new Error('Unable to decrypt source artifact; key or artifact is invalid');
  }
}
