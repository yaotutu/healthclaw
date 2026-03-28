import { eq, desc, and } from 'drizzle-orm';
import type { Db } from './db';
import { memories, type MemoryRecord, type NewMemoryRecord } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 记忆记录数据接口
 * 用于存储 Agent 从对话中提取的关于用户的长期记忆
 */
export interface MemoryRecordData {
  /** 记忆内容 */
  content: string;
  /** 记忆分类：feedback(反馈) / preference(偏好) / fact(事实) */
  category?: string;
}

/**
 * 记忆查询选项接口
 */
export interface MemoryQueryOptions {
  /** 按分类筛选 */
  category?: string;
  /** 返回数量限制 */
  limit?: number;
}

/**
 * 创建记忆存储模块
 * 提供 Agent 长期记忆的保存、查询和删除功能
 * 记忆用于跨会话的个性化健康建议，例如用户偏好、反馈和健康事实
 * @param db Drizzle ORM 数据库实例
 */
export const createMemoryStore = (db: Db) => {
  /**
   * 保存一条记忆
   * 将 Agent 从对话中提取的关键信息存储为长期记忆
   * @param userId 用户ID
   * @param data 记忆数据（内容和分类）
   * @returns 创建成功的记忆记录
   */
  const save = async (userId: string, data: MemoryRecordData): Promise<MemoryRecord> => {
    const recordData: NewMemoryRecord = {
      userId,
      content: data.content,
      category: data.category,
      createdAt: Date.now(),
    };

    const result = await db.insert(memories).values(recordData).returning();
    logger.info('[store:memory] saved userId=%s category=%s content=%s', userId, result[0].category, result[0].content.substring(0, 50));
    return result[0];
  };

  /**
   * 查询记忆列表
   * 支持按分类筛选和限制返回数量，按创建时间倒序排列
   * @param userId 用户ID
   * @param options 查询选项（分类筛选、数量限制）
   * @returns 记忆记录列表，按创建时间倒序排列
   */
  const query = async (userId: string, options: MemoryQueryOptions = {}): Promise<MemoryRecord[]> => {
    const { category, limit } = options;

    // 构建查询条件：必须匹配用户ID
    const conditions = [eq(memories.userId, userId)];

    // 如果指定了分类，添加分类过滤条件
    if (category !== undefined) {
      conditions.push(eq(memories.category, category));
    }

    // 构建查询：按创建时间倒序
    // 使用条件判断避免 Drizzle ORM 类型系统中 limit 链式调用的类型不匹配问题
    if (limit !== undefined) {
      return db
        .select()
        .from(memories)
        .where(and(...conditions))
        .orderBy(desc(memories.createdAt))
        .limit(limit);
    }

    return db
      .select()
      .from(memories)
      .where(and(...conditions))
      .orderBy(desc(memories.createdAt));
  };

  /**
   * 删除指定记忆
   * 根据 ID 删除一条记忆记录，同时验证用户归属以确保安全
   * @param userId 用户ID（用于权限验证）
   * @param memoryId 要删除的记忆ID
   * @returns 是否成功删除（true 表示已删除，false 表示未找到或不属于该用户）
   */
  const remove = async (userId: string, memoryId: number): Promise<boolean> => {
    const result = await db
      .delete(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
      .returning();

    logger.info('[store:memory] removed userId=%s memoryId=%d', userId, memoryId);
    return result.length > 0;
  };

  /**
   * 获取用户所有记忆
   * 用于上下文注入，将用户的所有记忆提供给 Agent 用于个性化回复
   * @param userId 用户ID
   * @returns 该用户的所有记忆记录，按创建时间倒序排列
   */
  const getAll = async (userId: string): Promise<MemoryRecord[]> => {
    return db
      .select()
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(desc(memories.createdAt));
  };

  return { save, query, remove, getAll };
};

/**
 * 记忆存储模块类型
 */
export type MemoryStore = ReturnType<typeof createMemoryStore>;
