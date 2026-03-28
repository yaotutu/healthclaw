import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { userProfiles, type UserProfile, type NewUserProfile } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 创建用户档案存储模块
 * 提供用户档案的查询和创建/更新（upsert）操作
 * @param db Drizzle ORM 数据库实例
 */
export const createProfileStore = (db: Db) => {
  /**
   * 获取用户档案
   * 根据用户 ID 查询档案信息，不存在则返回 undefined
   * @param userId 用户ID
   * @returns 用户档案，不存在则为 undefined
   */
  const get = async (userId: string): Promise<UserProfile | undefined> => {
    const results = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return results[0];
  };

  /**
   * 创建或更新用户档案（upsert 操作）
   * 如果该用户的档案已存在则更新，不存在则创建新档案
   * @param userId 用户ID
   * @param data 要更新的档案字段（不包括 userId、createdAt、updatedAt）
   * @returns 创建或更新后的完整用户档案
   */
  const upsert = async (
    userId: string,
    data: Partial<Omit<NewUserProfile, 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<UserProfile> => {
    // 先查询是否已有档案
    const existing = await get(userId);
    const now = Date.now();

    let result: UserProfile;
    if (existing) {
      // 档案已存在，执行更新操作
      result = (await db.update(userProfiles)
        .set({ ...data, updatedAt: now })
        .where(eq(userProfiles.userId, userId))
        .returning())[0];
    } else {
      // 档案不存在，创建新档案
      result = (await db.insert(userProfiles)
        .values({ userId, ...data, createdAt: now, updatedAt: now })
        .returning())[0];
    }

    logger.info('[store:profile] upserted userId=%s', userId);
    return result;
  };

  return { get, upsert };
};

/** 用户档案存储模块类型 */
export type ProfileStore = ReturnType<typeof createProfileStore>;
