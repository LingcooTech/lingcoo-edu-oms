import { createHash, randomBytes } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import {
  wechatMiniBindPhoneRequestSchema,
  wechatMiniLoginRequestSchema,
  type WechatMiniAuthenticatedSession,
  type WechatMiniBindPhoneRequest,
  type WechatMiniLoginRequest,
  type WechatMiniLoginResponse,
} from '@lingcoo-edu-oms/contracts';

import type { AuditContext } from '../../audit/public.js';
import type { ExternalIdentityReference, PublicIdentityUser } from '../../identity/public.js';
import type { SettingsReader } from '../../settings/public.js';
import type { WechatMiniProgramGateway } from '../domain/model.js';
import {
  type WechatMiniAuthChallenge,
  type WechatMiniAuthRepository,
} from '../infrastructure/persistence/wechat-mini-auth.repository.js';

const BIND_TOKEN_TTL_MS = 10 * 60 * 1_000;

export interface WechatMiniAuthIdentityPort {
  findExternalIdentityUser(
    reference: ExternalIdentityReference,
  ): Promise<PublicIdentityUser | null>;
  bindExternalIdentityToPhone(
    input: ExternalIdentityReference & { phone: string },
  ): Promise<PublicIdentityUser>;
  findExternalIdentitySubjectForUser(
    userId: string,
    reference: Pick<ExternalIdentityReference, 'provider' | 'appId'>,
  ): Promise<string | null>;
  createSessionForUser(
    userId: string,
    context: Partial<AuditContext>,
  ): Promise<{
    sessionId: string;
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
    user: PublicIdentityUser;
  }>;
}

interface WechatMiniAuthChallengeStore {
  createChallenge(
    input: WechatMiniAuthChallenge & { tokenDigest: string; expiresAt: Date },
  ): Promise<void>;
  consumeChallenge(tokenDigest: string): Promise<WechatMiniAuthChallenge | null>;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export class WechatMiniAuthService {
  constructor(
    private readonly settings: SettingsReader,
    private readonly wechat: WechatMiniProgramGateway,
    private readonly challenges: WechatMiniAuthChallengeStore,
    private readonly identity: WechatMiniAuthIdentityPort,
  ) {}

  async login(
    input: WechatMiniLoginRequest,
    context: Partial<AuditContext>,
  ): Promise<WechatMiniLoginResponse> {
    const { code } = wechatMiniLoginRequestSchema.parse(input);
    const [session, appId] = await Promise.all([this.wechat.exchangeCode(code), this.appId()]);
    const reference = this.reference(appId, session.openId, session.unionId);
    const user = await this.identity.findExternalIdentityUser(reference);
    if (user) return this.authenticated(user, context);

    const bindToken = newToken();
    const expiresAt = new Date(Date.now() + BIND_TOKEN_TTL_MS);
    await this.challenges.createChallenge({
      tokenDigest: digest(bindToken),
      appId,
      openId: session.openId,
      unionId: session.unionId,
      expiresAt,
    });
    return {
      status: 'binding_required',
      bindToken,
      bindExpiresAt: expiresAt.toISOString(),
    };
  }

  async bindPhone(
    input: WechatMiniBindPhoneRequest,
    context: Partial<AuditContext>,
  ): Promise<WechatMiniAuthenticatedSession> {
    const parsed = wechatMiniBindPhoneRequestSchema.parse(input);
    // Get the phone number before consuming the challenge: a transient WeChat failure does not
    // strand a valid login challenge, while the successful bind below remains exactly once.
    const phone = await this.wechat.getPhoneNumber(parsed.code);
    const challenge = await this.challenges.consumeChallenge(digest(parsed.bindToken));
    if (!challenge) {
      throw new ApiError(400, 'WECHAT_MINI_BIND_TOKEN_INVALID', '绑定令牌无效或已过期');
    }
    const user = await this.identity.bindExternalIdentityToPhone({
      ...this.reference(challenge.appId, challenge.openId, challenge.unionId),
      phone: phone.phoneNumber,
    });
    return this.authenticated(user, context);
  }

  async openIdForIdentity(identityUserId: string): Promise<string> {
    const appId = await this.appId();
    const openId = await this.identity.findExternalIdentitySubjectForUser(identityUserId, {
      provider: 'wechat_mini_program',
      appId,
    });
    if (!openId) {
      throw new ApiError(409, 'WECHAT_MINI_OPENID_NOT_BOUND', '该账号尚未绑定当前微信小程序');
    }
    return openId;
  }

  private async authenticated(
    user: PublicIdentityUser,
    context: Partial<AuditContext>,
  ): Promise<WechatMiniAuthenticatedSession> {
    const result = await this.identity.createSessionForUser(user.id, context);
    return {
      status: 'authenticated',
      user: this.serializeUser(result.user),
      session: { id: result.sessionId, expiresAt: result.expiresAt.toISOString() },
      csrfToken: result.csrfToken,
      accessToken: result.sessionToken,
    };
  }

  private async appId(): Promise<string> {
    const appId = await this.settings.getValue<string>('wechat-mini-program.app-id');
    if (!appId) {
      throw new ApiError(503, 'WECHAT_MINI_PROGRAM_NOT_CONFIGURED', '微信小程序 AppID 尚未配置');
    }
    return appId;
  }

  private reference(
    appId: string,
    subject: string,
    unionId: string | null,
  ): ExternalIdentityReference {
    return { provider: 'wechat_mini_program', appId, subject, unionId };
  }

  private serializeUser(user: PublicIdentityUser): WechatMiniAuthenticatedSession['user'] {
    return {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

export function createWechatMiniAuthRepositoryStore(
  repository: WechatMiniAuthRepository,
): WechatMiniAuthChallengeStore {
  return {
    createChallenge: (input) => repository.createChallenge(input),
    consumeChallenge: (tokenDigest) =>
      repository.transaction((tx) => repository.consumeChallenge(tokenDigest, tx)),
  };
}
