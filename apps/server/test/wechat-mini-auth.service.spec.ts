import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { PublicIdentityUser } from '../src/modules/identity/public.js';
import {
  type WechatMiniAuthIdentityPort,
  WechatMiniAuthService,
} from '../src/modules/wechat-mini-program/application/wechat-mini-auth.service.js';
import type { WechatMiniAuthChallenge } from '../src/modules/wechat-mini-program/infrastructure/persistence/wechat-mini-auth.repository.js';
import type { WechatMiniProgramGateway } from '../src/modules/wechat-mini-program/public.js';

const now = new Date('2026-09-11T00:00:00.000Z');

function user(id: string, phone = '+8613812345678'): PublicIdentityUser {
  return {
    id,
    email: null,
    phone,
    mustChangePassword: false,
    displayName: null,
    status: 'active',
    emailVerifiedAt: null,
    createdAt: now,
  };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

class ChallengeStore {
  readonly records: Array<WechatMiniAuthChallenge & { tokenDigest: string; expiresAt: Date }> = [];

  async createChallenge(input: WechatMiniAuthChallenge & { tokenDigest: string; expiresAt: Date }) {
    this.records.push(input);
  }

  async consumeChallenge(tokenDigest: string) {
    const index = this.records.findIndex(
      (record) => record.tokenDigest === tokenDigest && record.expiresAt > new Date(),
    );
    if (index < 0) return null;
    const [record] = this.records.splice(index, 1);
    return record ?? null;
  }
}

class IdentityPort implements WechatMiniAuthIdentityPort {
  readonly bindings = new Map<string, PublicIdentityUser>();
  readonly subjectsByUser = new Map<string, string>();
  readonly sessions: string[] = [];

  async findExternalIdentityUser(reference: { appId: string; subject: string }) {
    return this.bindings.get(`${reference.appId}:${reference.subject}`) ?? null;
  }

  async bindExternalIdentityToPhone(input: { appId: string; subject: string; phone: string }) {
    const key = `${input.appId}:${input.subject}`;
    const existing = this.bindings.get(key);
    if (existing) return existing;
    const normalizedPhone = `+86${input.phone
      .replace(/[ ()-]/g, '')
      .replace(/^(?:\+86|0086)/, '')}`;
    const created = user(`user-${this.bindings.size + 1}`, normalizedPhone);
    this.bindings.set(key, created);
    this.subjectsByUser.set(created.id, input.subject);
    return created;
  }

  async findExternalIdentitySubjectForUser(userId: string) {
    return this.subjectsByUser.get(userId) ?? null;
  }

  async createSessionForUser(userId: string) {
    const bound = [...this.bindings.values()].find((candidate) => candidate.id === userId);
    if (!bound) throw new Error('missing user');
    this.sessions.push(userId);
    return {
      sessionId: `session-${this.sessions.length}`,
      sessionToken: 's'.repeat(43),
      csrfToken: 'c'.repeat(43),
      expiresAt: new Date('2026-09-18T00:00:00.000Z'),
      user: bound,
    };
  }
}

function gateway(): WechatMiniProgramGateway {
  return {
    async exchangeCode() {
      return { openId: 'openid-1', unionId: 'unionid-1', sessionKey: 'never-exposed' };
    },
    async getPhoneNumber() {
      return {
        phoneNumber: '+86 138-1234-5678',
        purePhoneNumber: '13812345678',
        countryCode: '86',
      };
    },
    async sendSubscribeMessage() {},
    async testConnection() {},
  };
}

function service(challenges = new ChallengeStore(), identity = new IdentityPort()) {
  return {
    challenges,
    identity,
    service: new WechatMiniAuthService(
      {
        async getValue<T>() {
          return 'wx1234567890abcdef' as unknown as T;
        },
        async publicValues() {
          return {};
        },
      },
      gateway(),
      challenges,
      identity,
    ),
  };
}

describe('WeChat mini-program auth service', () => {
  it('issues only a digest-backed, single-use bind challenge for an unbound openid', async () => {
    const fixture = service();

    const login = await fixture.service.login({ code: 'login-code' }, {});
    expect(login.status).toBe('binding_required');
    if (login.status !== 'binding_required') throw new Error('expected binding challenge');
    expect(fixture.challenges.records).toHaveLength(1);
    expect(fixture.challenges.records[0]).toMatchObject({
      tokenDigest: digest(login.bindToken),
      appId: 'wx1234567890abcdef',
      openId: 'openid-1',
    });
    expect(fixture.challenges.records[0]?.tokenDigest).not.toBe(login.bindToken);

    const bound = await fixture.service.bindPhone(
      { bindToken: login.bindToken, code: 'phone-code' },
      {},
    );
    expect(bound).toMatchObject({ status: 'authenticated', user: { phone: '+8613812345678' } });
    expect(fixture.identity.sessions).toEqual(['user-1']);
    await expect(
      fixture.service.bindPhone({ bindToken: login.bindToken, code: 'phone-code' }, {}),
    ).rejects.toMatchObject({ code: 'WECHAT_MINI_BIND_TOKEN_INVALID' });
  });

  it('signs in an existing binding without creating a new challenge', async () => {
    const fixture = service();
    const existing = user('user-existing');
    fixture.identity.bindings.set('wx1234567890abcdef:openid-1', existing);
    fixture.identity.subjectsByUser.set(existing.id, 'openid-1');

    await expect(fixture.service.login({ code: 'login-code' }, {})).resolves.toMatchObject({
      status: 'authenticated',
      user: { id: 'user-existing' },
    });
    expect(fixture.challenges.records).toHaveLength(0);
  });

  it('exposes an openid directory only for the current configured app binding', async () => {
    const fixture = service();
    await expect(fixture.service.openIdForIdentity('unknown-user')).rejects.toMatchObject({
      code: 'WECHAT_MINI_OPENID_NOT_BOUND',
    });
    fixture.identity.subjectsByUser.set('user-1', 'openid-1');
    await expect(fixture.service.openIdForIdentity('user-1')).resolves.toBe('openid-1');
  });
});
