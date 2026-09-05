import { describe, expect, it } from 'vitest';

import { validateEnvironment } from '../src/config/environment.js';

const base = {
  DATABASE_URL: 'postgres://app:password@localhost:5438/app',
};

describe('identity environment', () => {
  it('requires the public URL used by action links in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'production-v1',
        SETTINGS_ENCRYPTION_KEYS: JSON.stringify({ 'production-v1': 'a'.repeat(32) }),
      }),
    ).toThrow(/APP_PUBLIC_URL/);
  });

  it('requires secure cookies in production', () => {
    expect(() =>
      validateEnvironment({ ...base, NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }),
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('never permits exposed action tokens in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        AUTH_EXPOSE_TEST_TOKENS: 'true',
      }),
    ).toThrow(/AUTH_EXPOSE_TEST_TOKENS/);
  });

  it('requires bootstrap credentials as a pair', () => {
    expect(() =>
      validateEnvironment({ ...base, BOOTSTRAP_OWNER_EMAIL: 'owner@example.com' }),
    ).toThrow(/BOOTSTRAP_OWNER_EMAIL/);
  });

  it('rejects the default settings encryption key in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
      }),
    ).toThrow(/SETTINGS_ENCRYPTION_KEYS/);
  });

  it('requires the current settings key ID to exist in the keyring', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        SETTINGS_ENCRYPTION_CURRENT_KEY_ID: 'missing',
        SETTINGS_ENCRYPTION_KEYS: JSON.stringify({ available: 'a'.repeat(32) }),
      }),
    ).toThrow(/SETTINGS_ENCRYPTION_CURRENT_KEY_ID/);
  });
});
