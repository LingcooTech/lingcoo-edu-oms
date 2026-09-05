import { and, count, desc, eq, gt, ilike, isNull, lt, ne, or } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import type {
  IdentityActionPurpose,
  IdentityUserPage,
  PublicIdentitySession,
  PublicIdentityUser,
  ResolvedIdentitySession,
} from '../../domain/model.js';
import {
  identityActionTokens,
  identityPasswordCredentials,
  identitySessions,
  identityUsers,
} from './identity.schema.js';

export interface IdentityCredential {
  user: PublicIdentityUser;
  passwordHash: string;
}

function publicUser(user: typeof identityUsers.$inferSelect): PublicIdentityUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}

export class IdentityRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async findCredentialByEmail(email: string): Promise<IdentityCredential | null> {
    return this.findCredential(eq(identityUsers.email, email));
  }

  async findCredentialByUserId(
    userId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<IdentityCredential | null> {
    return this.findCredential(eq(identityUsers.id, userId), executor);
  }

  async findUserByEmail(email: string): Promise<PublicIdentityUser | null> {
    const [user] = await this.database.db
      .select()
      .from(identityUsers)
      .where(eq(identityUsers.email, email))
      .limit(1);
    return user ? publicUser(user) : null;
  }

  async findUserById(
    userId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<PublicIdentityUser | null> {
    const [user] = await executor
      .select()
      .from(identityUsers)
      .where(eq(identityUsers.id, userId))
      .limit(1);
    return user ? publicUser(user) : null;
  }

  async listUsers(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: 'active' | 'disabled';
  }): Promise<IdentityUserPage> {
    const searchCondition = input.search
      ? or(
          ilike(identityUsers.email, `%${input.search}%`),
          ilike(identityUsers.displayName, `%${input.search}%`),
        )
      : undefined;
    const condition = and(
      searchCondition,
      input.status ? eq(identityUsers.status, input.status) : undefined,
    );
    const [items, [total]] = await Promise.all([
      this.database.db
        .select()
        .from(identityUsers)
        .where(condition)
        .orderBy(desc(identityUsers.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.database.db.select({ value: count() }).from(identityUsers).where(condition),
    ]);
    return {
      items: items.map(publicUser),
      page: input.page,
      pageSize: input.pageSize,
      total: total?.value ?? 0,
    };
  }

  async createUser(
    input: {
      email: string;
      displayName?: string | null;
      passwordHash: string;
      emailVerified: boolean;
    },
    executor?: DatabaseExecutor,
  ): Promise<PublicIdentityUser> {
    const create = async (writeExecutor: DatabaseExecutor) => {
      const [user] = await writeExecutor
        .insert(identityUsers)
        .values({
          email: input.email,
          displayName: input.displayName,
          emailVerifiedAt: input.emailVerified ? new Date() : null,
        })
        .returning();
      if (!user) throw new Error('Failed to create identity user');
      await writeExecutor.insert(identityPasswordCredentials).values({
        userId: user.id,
        passwordHash: input.passwordHash,
      });
      return publicUser(user);
    };
    return executor ? create(executor) : this.database.transaction(create);
  }

  async updateUser(
    input: {
      userId: string;
      displayName?: string | null;
      status?: 'active' | 'disabled';
    },
    executor?: DatabaseExecutor,
  ): Promise<PublicIdentityUser | null> {
    const update = async (writeExecutor: DatabaseExecutor) => {
      const [user] = await writeExecutor
        .update(identityUsers)
        .set({
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(identityUsers.id, input.userId))
        .returning();
      if (!user) return null;
      if (input.status === 'disabled') await this.revokeSessions(writeExecutor, input.userId);
      return publicUser(user);
    };
    return executor ? update(executor) : this.database.transaction(update);
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    await executor
      .update(identityPasswordCredentials)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(identityPasswordCredentials.userId, userId));
  }

  async changePasswordAndRevokeSessions(
    userId: string,
    passwordHash: string,
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const change = async (writeExecutor: DatabaseExecutor) => {
      await writeExecutor
        .update(identityPasswordCredentials)
        .set({ passwordHash, passwordChangedAt: new Date() })
        .where(eq(identityPasswordCredentials.userId, userId));
      await this.revokeSessions(writeExecutor, userId);
    };
    await (executor ? change(executor) : this.database.transaction(change));
  }

  async createSession(
    input: {
      userId: string;
      tokenDigest: string;
      csrfDigest: string;
      expiresAt: Date;
      userAgent: string | null;
      ipAddress: string | null;
    },
    executor: DatabaseExecutor = this.database.db,
  ): Promise<{ id: string; expiresAt: Date }> {
    const [session] = await executor.insert(identitySessions).values(input).returning({
      id: identitySessions.id,
      expiresAt: identitySessions.expiresAt,
    });
    if (!session) throw new Error('Failed to create identity session');
    return session;
  }

  async resolveSession(tokenDigest: string): Promise<ResolvedIdentitySession | null> {
    const [record] = await this.database.db
      .select({ session: identitySessions, user: identityUsers })
      .from(identitySessions)
      .innerJoin(identityUsers, eq(identityUsers.id, identitySessions.userId))
      .where(
        and(
          eq(identitySessions.tokenDigest, tokenDigest),
          isNull(identitySessions.revokedAt),
          gt(identitySessions.expiresAt, new Date()),
          eq(identityUsers.status, 'active'),
        ),
      )
      .limit(1);
    if (!record) return null;
    return {
      sessionId: record.session.id,
      csrfDigest: record.session.csrfDigest,
      expiresAt: record.session.expiresAt,
      user: publicUser(record.user),
    };
  }

  async touchSession(sessionId: string): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await this.database.db
      .update(identitySessions)
      .set({ lastSeenAt: new Date() })
      .where(
        and(eq(identitySessions.id, sessionId), lt(identitySessions.lastSeenAt, fiveMinutesAgo)),
      );
  }

  async listActiveSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<PublicIdentitySession[]> {
    const sessions = await this.database.db
      .select({
        id: identitySessions.id,
        userAgent: identitySessions.userAgent,
        ipAddress: identitySessions.ipAddress,
        createdAt: identitySessions.createdAt,
        lastSeenAt: identitySessions.lastSeenAt,
        expiresAt: identitySessions.expiresAt,
      })
      .from(identitySessions)
      .where(
        and(
          eq(identitySessions.userId, userId),
          isNull(identitySessions.revokedAt),
          gt(identitySessions.expiresAt, new Date()),
        ),
      )
      .orderBy(identitySessions.createdAt);
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  async revokeSession(
    sessionId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    await executor
      .update(identitySessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(identitySessions.id, sessionId), isNull(identitySessions.revokedAt)));
  }

  async revokeOwnedSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<boolean> {
    const [revoked] = await executor
      .update(identitySessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(identitySessions.id, sessionId),
          eq(identitySessions.userId, userId),
          ne(identitySessions.id, currentSessionId),
          isNull(identitySessions.revokedAt),
        ),
      )
      .returning({ id: identitySessions.id });
    return Boolean(revoked);
  }

  async createActionToken(
    input: {
      userId: string;
      purpose: IdentityActionPurpose;
      tokenDigest: string;
      expiresAt: Date;
    },
    executor?: DatabaseExecutor,
  ): Promise<void> {
    const create = async (writeExecutor: DatabaseExecutor) => {
      await writeExecutor
        .update(identityActionTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(identityActionTokens.userId, input.userId),
            eq(identityActionTokens.purpose, input.purpose),
            isNull(identityActionTokens.consumedAt),
          ),
        );
      await writeExecutor.insert(identityActionTokens).values(input);
    };
    await (executor ? create(executor) : this.database.transaction(create));
  }

  async consumeEmailVerification(
    tokenDigest: string,
    executor?: DatabaseExecutor,
  ): Promise<string | null> {
    const consume = async (writeExecutor: DatabaseExecutor) => {
      const [token] = await writeExecutor
        .update(identityActionTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(identityActionTokens.tokenDigest, tokenDigest),
            eq(identityActionTokens.purpose, 'email_verification'),
            isNull(identityActionTokens.consumedAt),
            gt(identityActionTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: identityActionTokens.userId });
      if (!token) return false;
      await writeExecutor
        .update(identityUsers)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(identityUsers.id, token.userId));
      return token.userId;
    };
    const result = executor ? await consume(executor) : await this.database.transaction(consume);
    return result || null;
  }

  async resetPasswordWithToken(
    tokenDigest: string,
    passwordHash: string,
    executor?: DatabaseExecutor,
  ): Promise<string | null> {
    const reset = async (writeExecutor: DatabaseExecutor) => {
      const [token] = await writeExecutor
        .update(identityActionTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(identityActionTokens.tokenDigest, tokenDigest),
            eq(identityActionTokens.purpose, 'password_reset'),
            isNull(identityActionTokens.consumedAt),
            gt(identityActionTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: identityActionTokens.userId });
      if (!token) return false;
      await writeExecutor
        .update(identityPasswordCredentials)
        .set({ passwordHash, passwordChangedAt: new Date() })
        .where(eq(identityPasswordCredentials.userId, token.userId));
      await this.revokeSessions(writeExecutor, token.userId);
      return token.userId;
    };
    const result = executor ? await reset(executor) : await this.database.transaction(reset);
    return result || null;
  }

  transaction<T>(work: (executor: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }

  private async findCredential(
    condition: ReturnType<typeof eq>,
    executor: DatabaseExecutor = this.database.db,
  ): Promise<IdentityCredential | null> {
    const [record] = await executor
      .select({ user: identityUsers, passwordHash: identityPasswordCredentials.passwordHash })
      .from(identityUsers)
      .innerJoin(
        identityPasswordCredentials,
        eq(identityPasswordCredentials.userId, identityUsers.id),
      )
      .where(condition)
      .limit(1);
    return record ? { user: publicUser(record.user), passwordHash: record.passwordHash } : null;
  }

  private async revokeSessions(executor: DatabaseExecutor, userId: string): Promise<void> {
    await executor
      .update(identitySessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(identitySessions.userId, userId), isNull(identitySessions.revokedAt)));
  }
}
