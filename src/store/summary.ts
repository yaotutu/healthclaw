import { eq, desc, and, gte } from 'drizzle-orm';
import type { Db } from './db';
import { conversationSummaries, type ConversationSummary, type NewConversationSummary } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 对话摘要数据接口
 * 用于存储会话的压缩摘要信息
 */
export interface SummaryRecordData {
  /** 对话摘要内容 */
  summary: string;
  /** 摘要涵盖的消息数量 */
  messageCount: number;
  /** 摘要涵盖的起始时间戳 */
  startTimestamp: number;
  /** 摘要涵盖的结束时间戳 */
  endTimestamp: number;
}

/**
 * 创建对话摘要存储模块
 * 提供会话摘要的保存和查询功能
 * 当会话消息过多时，将旧消息压缩为摘要以节省 token，同时保留上下文信息
 * @param db Drizzle ORM 数据库实例
 */
export const createSummaryStore = (db: Db) => {
  /**
   * 保存一条对话摘要
   * 将会话中的一段消息压缩为摘要并存储
   * @param userId 用户ID
   * @param data 摘要数据（内容、消息数量、时间范围）
   * @returns 创建成功的摘要记录
   */
  const save = async (userId: string, data: SummaryRecordData): Promise<ConversationSummary> => {
    const recordData: NewConversationSummary = {
      userId,
      summary: data.summary,
      messageCount: data.messageCount,
      startTimestamp: data.startTimestamp,
      endTimestamp: data.endTimestamp,
      createdAt: Date.now(),
    };

    const result = await db.insert(conversationSummaries).values(recordData).returning();
    logger.info('[store:summary] saved userId=%s messageCount=%d', userId, data.messageCount);
    return result[0];
  };

  /**
   * 获取最近的对话摘要
   * 查询用户在最近 30 天内的对话摘要，用于提供会话上下文
   * @param userId 用户ID
   * @param limit 最大返回数量，默认为 5 条
   * @returns 对话摘要列表，按创建时间倒序排列
   */
  const getRecent = async (userId: string, limit: number = 5): Promise<ConversationSummary[]> => {
    // 计算 30 天前的时间戳，用于过滤最近的摘要
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return db
      .select()
      .from(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.userId, userId),
          gte(conversationSummaries.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(conversationSummaries.createdAt))
      .limit(limit);
  };

  return { save, getRecent };
};

/**
 * 对话摘要存储模块类型
 */
export type SummaryStore = ReturnType<typeof createSummaryStore>;
