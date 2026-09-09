import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { ApiError } from '@lingcoo-tech/http';
import { hashPassword, needsPasswordRehash, verifyPassword } from '../infrastructure/password.js';
import type {
  ChangePasswordRequest,
  ConfirmPasswordReset,
  LoginRequest,
} from '@lingcoo-edu-oms/contracts';
import {
  createAccessUserRequestSchema,
  loginRequestSchema,
  passwordSchema,
} from '@lingcoo-edu-oms/contracts';

import type { AppEnvironment } from '../../../config/environment.js';
import type { DatabaseExecutor } from '../../../database/database.js';
import { NOOP_AUDIT_WRITER, type AuditContext, type AuditWriter } from '../../audit/public.js';
import type {
  IdentityUserPage,
  PublicIdentitySession,
  PublicIdentityUser,
  ResolvedIdentitySession,
} from '../domain/model.js';
import type { IdentityRepository } from '../infrastructure/persistence/identity.repository.js';
import type { IdentityActionDelivery } from './action-delivery.port.js';

export interface IdentityLoginResult {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  user: PublicIdentityUser;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function invalidCredentials(): ApiError {
  return new ApiError(401, 'INVALID_CREDENTIALS', '邮箱、手机号或密码错误');
}

function invalidActionToken(): ApiError {
  return new ApiError(400, 'INVALID_ACTION_TOKEN', '操作令牌无效或已过期');
}

export class IdentityService {
  private readonly dummyPasswordHash = hashPassword('not-a-real-user-password');

  constructor(
    private readonly repository: IdentityRepository,
    private readonly environment: AppEnvironment,
    private readonly actionDelivery: IdentityActionDelivery,
    private readonly audit: AuditWriter = NOOP_AUDIT_WRITER,
  ) {}

  async login(input: LoginRequest, context: Partial<AuditContext>): Promise<IdentityLoginResult> {
    const parsed = loginRequestSchema.parse(input);
    const identifier = parsed.identifier ?? parsed.email!;
    const credential = await this.repository.findCredentialByIdentifier(identifier);
    const passwordHash = credential?.passwordHash ?? (await this.dummyPasswordHash);
    const valid = await verifyPassword(input.password, passwordHash);
    if (!credential || !valid || credential.user.status !== 'active') {
      await this.audit.record({
        ...this.userAuditContext(context, null, identifier),
        category: 'security',
        action: 'identity.login.failed',
        resourceType: 'identity.session',
        outcome: 'failure',
        metadata: { reason: 'invalid_credentials' },
      });
      throw invalidCredentials();
    }

    const sessionToken = token();
    const csrfToken = token();
    const expiresAt = new Date(Date.now() + this.environment.AUTH_SESSION_TTL_SECONDS * 1000);
    const session = await this.repository.transaction(async (transaction) => {
      await this.repository.lockUser(credential.user.id, transaction);
      const current = await this.repository.findCredentialByUserId(credential.user.id, transaction);
      if (
        !current ||
        current.user.status !== 'active' ||
        current.passwordHash !== credential.passwordHash
      ) {
        throw invalidCredentials();
      }
      credential.user = current.user;
      if (needsPasswordRehash(credential.passwordHash)) {
        await this.repository.updatePasswordHash(
          credential.user.id,
          await hashPassword(input.password),
          transaction,
        );
      }
      const created = await this.repository.createSession(
        {
          userId: credential.user.id,
          tokenDigest: digest(sessionToken),
          csrfDigest: digest(csrfToken),
          expiresAt,
          userAgent: context.userAgent ?? null,
          ipAddress: context.ipAddress ?? null,
        },
        transaction,
      );
      await this.audit.record(
        {
          ...this.userAuditContext(
            context,
            credential.user.id,
            credential.user.displayName ?? credential.user.email ?? credential.user.phone,
          ),
          category: 'security',
          action: 'identity.login.succeeded',
          resourceType: 'identity.session',
          resourceId: created.id,
        },
        transaction,
      );
      return created;
    });
    return {
      sessionId: session.id,
      sessionToken,
      csrfToken,
      expiresAt: session.expiresAt,
      user: credential.user,
    };
  }

  async resolveSession(
    sessionToken: string,
    csrfToken: string,
  ): Promise<ResolvedIdentitySession | null> {
    const session = await this.repository.resolveSession(digest(sessionToken));
    if (!session || !this.digestMatches(csrfToken, session.csrfDigest)) return null;
    await this.repository.touchSession(session.sessionId);
    return session;
  }

  csrfMatches(value: string, expected: string): boolean {
    const actualBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  async logout(userId: string, sessionId: string, context?: Partial<AuditContext>): Promise<void> {
    await this.repository.transaction(async (transaction) => {
      await this.repository.revokeSession(sessionId, transaction);
      await this.audit.record(
        {
          ...this.userAuditContext(context, userId),
          category: 'security',
          action: 'identity.logout',
          resourceType: 'identity.session',
          resourceId: sessionId,
        },
        transaction,
      );
    });
  }

  listSessions(userId: string, currentSessionId: string): Promise<PublicIdentitySession[]> {
    return this.repository.listActiveSessions(userId, currentSessionId);
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    context?: Partial<AuditContext>,
  ): Promise<void> {
    if (sessionId === currentSessionId) {
      throw new ApiError(400, 'CURRENT_SESSION_REVOKE', '请使用退出登录撤销当前会话');
    }
    await this.repository.transaction(async (transaction) => {
      if (
        !(await this.repository.revokeOwnedSession(
          userId,
          sessionId,
          currentSessionId,
          transaction,
        ))
      ) {
        throw new ApiError(404, 'SESSION_NOT_FOUND', '会话不存在或已失效');
      }
      await this.audit.record(
        {
          ...this.userAuditContext(context, userId),
          category: 'security',
          action: 'identity.session.revoked',
          resourceType: 'identity.session',
          resourceId: sessionId,
        },
        transaction,
      );
    });
  }

  async changePassword(
    userId: string,
    input: ChangePasswordRequest,
    context?: Partial<AuditContext>,
  ): Promise<void> {
    const credential = await this.repository.findCredentialByUserId(userId);
    if (!credential || !(await verifyPassword(input.currentPassword, credential.passwordHash))) {
      throw invalidCredentials();
    }
    if (await verifyPassword(input.newPassword, credential.passwordHash)) {
      throw new ApiError(400, 'PASSWORD_REUSE', '新密码不能与当前密码相同');
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.repository.transaction(async (transaction) => {
      await this.repository.lockUser(userId, transaction);
      const current = await this.repository.findCredentialByUserId(userId, transaction);
      if (!current || current.passwordHash !== credential.passwordHash) throw invalidCredentials();
      await this.repository.changePasswordAndRevokeSessions(userId, passwordHash, transaction);
      await this.audit.record(
        {
          ...this.userAuditContext(context, userId),
          category: 'security',
          action: 'identity.password.changed',
          resourceType: 'identity.user',
          resourceId: userId,
        },
        transaction,
      );
    });
  }

  async requestPasswordReset(
    email: string,
    context?: Partial<AuditContext>,
  ): Promise<{ accepted: true; testToken?: string }> {
    const user = await this.repository.findUserByEmail(email);
    if (!user || !user.email || user.status !== 'active') {
      await this.audit.record({
        ...this.userAuditContext(context, null, email),
        category: 'security',
        action: 'identity.password-reset.requested',
        resourceType: 'identity.user',
        metadata: { accountMatched: false },
      });
      return { accepted: true };
    }
    const actionToken = token();
    const expiresAt = this.actionTokenExpiry();
    await this.repository.transaction(async (transaction) => {
      const tokenDigest = digest(actionToken);
      await this.repository.createActionToken(
        {
          userId: user.id,
          purpose: 'password_reset',
          tokenDigest,
          expiresAt,
        },
        transaction,
      );
      await this.audit.record(
        {
          ...this.userAuditContext(context, user.id, user.displayName ?? user.email ?? user.phone),
          category: 'security',
          action: 'identity.password-reset.requested',
          resourceType: 'identity.user',
          resourceId: user.id,
          metadata: { accountMatched: true },
        },
        transaction,
      );
      await this.actionDelivery.deliver({
        userId: user.id,
        email: user.email!,
        purpose: 'password_reset',
        token: actionToken,
        tokenDigest,
        expiresAt,
        transaction,
      });
    });
    return this.exposedActionToken(actionToken);
  }

  async confirmPasswordReset(
    input: ConfirmPasswordReset,
    context?: Partial<AuditContext>,
  ): Promise<void> {
    const passwordHash = await hashPassword(input.newPassword);
    await this.repository.transaction(async (transaction) => {
      const userId = await this.repository.resetPasswordWithToken(
        digest(input.token),
        passwordHash,
        transaction,
      );
      if (!userId) throw invalidActionToken();
      await this.audit.record(
        {
          ...this.userAuditContext(context, userId),
          category: 'security',
          action: 'identity.password-reset.completed',
          resourceType: 'identity.user',
          resourceId: userId,
        },
        transaction,
      );
    });
  }

  async requestEmailVerification(
    userId: string,
    context?: Partial<AuditContext>,
  ): Promise<{ accepted: true; testToken?: string }> {
    const credential = await this.repository.findCredentialByUserId(userId);
    if (
      !credential ||
      !credential.user.email ||
      credential.user.status !== 'active' ||
      credential.user.emailVerifiedAt
    ) {
      return { accepted: true };
    }
    const actionToken = token();
    const expiresAt = this.actionTokenExpiry();
    await this.repository.transaction(async (transaction) => {
      const tokenDigest = digest(actionToken);
      await this.repository.createActionToken(
        {
          userId,
          purpose: 'email_verification',
          tokenDigest,
          expiresAt,
        },
        transaction,
      );
      await this.audit.record(
        {
          ...this.userAuditContext(
            context,
            userId,
            credential.user.displayName ?? credential.user.email ?? credential.user.phone,
          ),
          category: 'security',
          action: 'identity.email-verification.requested',
          resourceType: 'identity.user',
          resourceId: userId,
        },
        transaction,
      );
      await this.actionDelivery.deliver({
        userId,
        email: credential.user.email!,
        purpose: 'email_verification',
        token: actionToken,
        tokenDigest,
        expiresAt,
        transaction,
      });
    });
    return this.exposedActionToken(actionToken);
  }

  async confirmEmailVerification(
    actionToken: string,
    context?: Partial<AuditContext>,
  ): Promise<void> {
    await this.repository.transaction(async (transaction) => {
      const userId = await this.repository.consumeEmailVerification(
        digest(actionToken),
        transaction,
      );
      if (!userId) throw invalidActionToken();
      await this.audit.record(
        {
          ...this.userAuditContext(context, userId),
          category: 'security',
          action: 'identity.email-verification.completed',
          resourceType: 'identity.user',
          resourceId: userId,
        },
        transaction,
      );
    });
  }

  async ensureBootstrapUser(email: string, password: string): Promise<PublicIdentityUser> {
    const existing = await this.repository.findUserByEmail(email);
    if (existing) return existing;
    const passwordHash = await hashPassword(password);
    return this.repository.transaction(async (transaction) => {
      const user = await this.repository.createUser(
        {
          email,
          passwordHash,
          emailVerified: true,
        },
        transaction,
      );
      await this.audit.record(
        {
          actorType: 'system',
          category: 'system',
          action: 'identity.bootstrap-account.created',
          resourceType: 'identity.user',
          resourceId: user.id,
          changes: [
            { field: 'email', before: null, after: user.email },
            { field: 'status', before: null, after: user.status },
          ],
        },
        transaction,
      );
      return user;
    });
  }

  listUsers(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: 'active' | 'disabled';
  }): Promise<IdentityUserPage> {
    return this.repository.listUsers(input);
  }

  async getUser(userId: string, executor?: DatabaseExecutor): Promise<PublicIdentityUser> {
    const user = await this.repository.findUserById(userId, executor);
    if (!user) throw new ApiError(404, 'IDENTITY_USER_NOT_FOUND', '账号不存在');
    return user;
  }

  findUsersByIds(userIds: string[]): Promise<PublicIdentityUser[]> {
    return this.repository.findUsersByIds(userIds);
  }

  async createUser(
    input: {
      email?: string | null;
      phone?: string | null;
      mustChangePassword?: boolean;
      password: string;
      displayName?: string | null;
      emailVerified?: boolean;
    },
    context: { executor?: DatabaseExecutor } = {},
  ): Promise<PublicIdentityUser> {
    const parsed = createAccessUserRequestSchema.parse(input);
    const { email, phone, password } = parsed;
    if (email && (await this.repository.findUserByEmail(email))) {
      throw new ApiError(409, 'IDENTITY_EMAIL_EXISTS', '邮箱已被使用');
    }
    try {
      return await this.repository.createUser(
        {
          email,
          phone,
          mustChangePassword: parsed.mustChangePassword,
          displayName: input.displayName,
          passwordHash: await hashPassword(password),
          emailVerified: input.emailVerified ?? false,
        },
        context.executor,
      );
    } catch (error) {
      const constraint = this.uniqueViolationConstraint(error);
      if (constraint) {
        const isPhone = constraint === 'identity_users_phone_unique';
        throw new ApiError(
          409,
          isPhone ? 'IDENTITY_PHONE_EXISTS' : 'IDENTITY_EMAIL_EXISTS',
          isPhone ? '手机号已被使用' : '邮箱已被使用',
        );
      }
      throw error;
    }
  }

  async adminResetPassword(
    userId: string,
    newPassword: string,
    context: AuditContext,
  ): Promise<void> {
    const passwordHash = await hashPassword(passwordSchema.parse(newPassword));
    await this.repository.transaction(async (transaction) => {
      await this.repository.lockUser(userId, transaction);
      if (!(await this.repository.findUserById(userId, transaction))) {
        throw new ApiError(404, 'IDENTITY_USER_NOT_FOUND', '账号不存在');
      }
      await this.repository.changePasswordAndRevokeSessions(
        userId,
        passwordHash,
        transaction,
        true,
      );
      await this.audit.record(
        {
          ...context,
          category: 'security',
          action: 'identity.password.admin-reset',
          resourceType: 'identity.user',
          resourceId: userId,
          metadata: { sessionsRevoked: true, mustChangePassword: true },
        },
        transaction,
      );
    });
  }

  async updateUser(
    input: {
      userId: string;
      displayName?: string | null;
      status?: 'active' | 'disabled';
    },
    context: { executor?: DatabaseExecutor } = {},
  ): Promise<PublicIdentityUser> {
    const user = await this.repository.updateUser(input, context.executor);
    if (!user) throw new ApiError(404, 'IDENTITY_USER_NOT_FOUND', '账号不存在');
    return user;
  }

  private digestMatches(value: string, expectedDigest: string): boolean {
    const actual = Buffer.from(digest(value));
    const expected = Buffer.from(expectedDigest);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private userAuditContext(
    context: Partial<AuditContext> | undefined,
    userId: string | null,
    label?: string | null,
  ): AuditContext {
    return {
      actorType: 'user',
      actorId: userId,
      actorLabel: label ?? context?.actorLabel ?? null,
      requestId: context?.requestId ?? null,
      correlationId: context?.correlationId ?? null,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
    };
  }

  private actionTokenExpiry(): Date {
    return new Date(Date.now() + this.environment.AUTH_ACTION_TOKEN_TTL_SECONDS * 1000);
  }

  private exposedActionToken(actionToken: string): { accepted: true; testToken?: string } {
    return this.environment.AUTH_EXPOSE_TEST_TOKENS
      ? { accepted: true, testToken: actionToken }
      : { accepted: true };
  }

  private uniqueViolationConstraint(error: unknown): string | null {
    let current = error;
    for (let depth = 0; depth < 3; depth += 1) {
      if (typeof current !== 'object' || current === null) return null;
      if ('code' in current && current.code === '23505')
        return 'constraint' in current ? String(current.constraint) : 'unknown';
      current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
    }
    return null;
  }
}
