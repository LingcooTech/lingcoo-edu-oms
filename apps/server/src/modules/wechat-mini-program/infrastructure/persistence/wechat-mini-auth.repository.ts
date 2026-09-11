import { and, eq, gt, isNull } from 'drizzle-orm';

import type {
  DatabaseExecutor,
  DatabaseHandle,
  DatabaseTransaction,
} from '../../../../database/database.js';
import { wechatMiniAuthChallenges } from './wechat-mini-auth.schema.js';

export interface WechatMiniAuthChallenge {
  appId: string;
  openId: string;
  unionId: string | null;
}

export class WechatMiniAuthRepository {
  constructor(private readonly database: DatabaseHandle) {}

  async createChallenge(
    input: WechatMiniAuthChallenge & { tokenDigest: string; expiresAt: Date },
    executor: DatabaseExecutor = this.database.db,
  ): Promise<void> {
    await executor.insert(wechatMiniAuthChallenges).values(input);
  }

  // UPDATE ... RETURNING atomically consumes the challenge, so a bind token can win once only.
  async consumeChallenge(
    tokenDigest: string,
    executor: DatabaseTransaction,
  ): Promise<WechatMiniAuthChallenge | null> {
    const [challenge] = await executor
      .update(wechatMiniAuthChallenges)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(wechatMiniAuthChallenges.tokenDigest, tokenDigest),
          isNull(wechatMiniAuthChallenges.consumedAt),
          gt(wechatMiniAuthChallenges.expiresAt, new Date()),
        ),
      )
      .returning({
        appId: wechatMiniAuthChallenges.appId,
        openId: wechatMiniAuthChallenges.openId,
        unionId: wechatMiniAuthChallenges.unionId,
      });
    return challenge ?? null;
  }

  transaction<T>(work: (executor: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }
}
