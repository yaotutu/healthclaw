import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { healthObservations, type HealthObservation, type NewHealthObservation } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 查询选项接口
 */
export interface ObservationQueryOptions {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * 健康观察记录数据接口
 */
export interface ObservationRecordData {
  content: string;
  tags?: string[];
  timestamp?: number;
}

/**
 * 创建健康观察记录存储模块
 * 提供非结构化健康观察的记录和查询功能
 * 用于记录"最近睡眠不好"、"感觉压力大"等模糊感受
 * @param db Drizzle ORM 数据库实例
 */
export const createObservationStore = (db: Db) => {
  /**
   * 记录健康观察
   * 创建一条新的健康观察记录
   * @param userId 用户ID
   * @param data 观察数据（内容和标签）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: ObservationRecordData): Promise<HealthObservation> => {
    const now = Date.now();
    const recordData: NewHealthObservation = {
      userId,
      content: data.content,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(healthObservations).values(recordData).returning();
    logger.info('[store:observation] recorded userId=%s content=%s', userId, result[0].content);
    return result[0];
  };

  /**
   * 查询健康观察记录
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 观察记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: ObservationQueryOptions = {}): Promise<HealthObservation[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件
    const conditions = [eq(healthObservations.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(healthObservations.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(healthObservations.timestamp, endDate));
    }

    return db
      .select()
      .from(healthObservations)
      .where(and(...conditions))
      .orderBy(desc(healthObservations.timestamp))
      .limit(limit ?? 100);
  };

  return { record, query };
};

/**
 * 健康观察记录存储模块类型
 */
export type ObservationStore = ReturnType<typeof createObservationStore>;
