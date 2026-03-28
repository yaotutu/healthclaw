import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { waterRecords, type WaterRecord, type NewWaterRecord } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 查询选项接口
 */
export interface QueryOptions {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * 饮水记录数据接口
 */
export interface WaterRecordData {
  amount: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建饮水记录存储模块
 * 提供饮水量数据的记录和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createWaterStore = (db: Db) => {
  /**
   * 记录饮水
   * 创建一条新的饮水记录
   * @param userId 用户ID
   * @param data 饮水数据（饮水量ml）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: WaterRecordData): Promise<WaterRecord> => {
    const now = Date.now();
    const recordData: NewWaterRecord = {
      userId,
      amount: data.amount,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(waterRecords).values(recordData).returning();
    logger.info('[store:water] recorded userId=%s amount=%s', userId, result[0].amount);
    return result[0];
  };

  /**
   * 查询饮水记录历史
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 饮水记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<WaterRecord[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件，将用户ID与时间范围条件合并
    const conditions = [eq(waterRecords.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(waterRecords.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(waterRecords.timestamp, endDate));
    }

    return db
      .select()
      .from(waterRecords)
      .where(and(...conditions))
      .orderBy(desc(waterRecords.timestamp))
      .limit(limit ?? 100);
  };

  return { record, query };
};

/**
 * 饮水记录存储模块类型
 */
export type WaterStore = ReturnType<typeof createWaterStore>;
