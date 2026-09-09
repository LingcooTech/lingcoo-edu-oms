import {
  emailAddressSchema,
  loginRequestSchema,
  passwordSchema,
  sessionIdentitySchema,
  mainlandChinaPhoneSchema,
} from '../src/identity.js';
import { describe, expect, it } from 'vitest';

describe('identity contracts', () => {
  it('normalizes mainland phones and rejects ambiguous or invalid identifiers', () => {
    for (const phone of ['13800138000', '+86 138 0013 8000', '0086-138-0013-8000']) {
      expect(mainlandChinaPhoneSchema.parse(phone)).toBe('+8613800138000');
      expect(loginRequestSchema.parse({ identifier: phone, password: 'legacy' }).identifier).toBe(
        '+8613800138000',
      );
    }
    for (const phone of [
      '+1 13800138000',
      '12800138000',
      '138001380001',
      '138abc00138000',
      '8613800138000',
    ]) {
      expect(mainlandChinaPhoneSchema.safeParse(phone).success).toBe(false);
    }
    expect(loginRequestSchema.safeParse({ password: 'password' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({
        identifier: '13800138000',
        email: 'a@example.com',
        password: 'password',
      }).success,
    ).toBe(false);
  });
  it('normalizes email addresses', () => {
    expect(emailAddressSchema.parse(' Owner@Example.COM ')).toBe('owner@example.com');
  });

  it('requires a twelve character password for new credentials', () => {
    expect(passwordSchema.safeParse('too-short').success).toBe(false);
    expect(passwordSchema.safeParse('a-secure-password').success).toBe(true);
    expect(
      loginRequestSchema.parse({ email: 'a@example.com', password: 'existing' }).password,
    ).toBe('existing');
  });

  it('strips credential and raw session token fields from session identity', () => {
    const parsed = sessionIdentitySchema.parse({
      user: {
        id: '7f4cc774-403b-4d44-8c43-8f2fb26f0a85',
        email: 'owner@example.com',
        phone: null,
        mustChangePassword: false,
        displayName: null,
        status: 'active',
        emailVerifiedAt: null,
        createdAt: '2026-08-30T00:00:00.000Z',
        passwordHash: 'must-not-leak',
      },
      session: {
        id: '67f6711f-cebd-4035-9873-29bcd06f705f',
        expiresAt: '2026-08-31T00:00:00.000Z',
        token: 'must-not-leak',
      },
      csrfToken: 'abcdefghijklmnopqrstuvwxyz123456',
    });
    expect(parsed.user).not.toHaveProperty('passwordHash');
    expect(parsed.session).not.toHaveProperty('token');
  });
});
