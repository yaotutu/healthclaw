import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { waterRecords, type WaterRecord, type NewWaterRecord } from './schema';

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

    let queryBuilder = db
      .select()
      .from(waterRecords)
      .where(eq(waterRecords.userId, userId))
      .orderBy(desc(waterRecords.timestamp));

    if (startDate !== undefined) {
      queryBuilder = queryBuilder.where(gte(waterRecords.timestamp, startDate));
    }

    if (endDate !== undefined) {
      queryBuilder = queryBuilder.where(lte(waterRecords.timestamp, endDate));
    }

    if (limit !== undefined) {
      queryBuilder = queryBuilder.limit(limit);
    }

    return queryBuilder;
  };

  return { record, query };
};

/**
 * 饮水记录存储模块类型
 */
export type WaterStore = ReturnType<typeof createWaterStore>;
