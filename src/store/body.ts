import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { bodyRecords, type BodyRecord, type NewBodyRecord } from './schema';

/**
 * 查询选项接口
 */
export interface QueryOptions {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * 身体数据记录数据接口
 */
export interface BodyRecordData {
  weight?: number;
  bodyFat?: number;
  bmi?: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建身体数据存储模块
 * 提供体重、体脂率等身体数据的记录和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createBodyStore = (db: Db) => {
  /**
   * 记录身体数据
   * 创建一条新的身体指标记录
   * @param userId 用户ID
   * @param data 身体数据（体重、体脂率、BMI等）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: BodyRecordData): Promise<BodyRecord> => {
    const now = Date.now();
    const recordData: NewBodyRecord = {
      userId,
      weight: data.weight,
      bodyFat: data.bodyFat,
      bmi: data.bmi,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(bodyRecords).values(recordData).returning();
    return result[0];
  };

  /**
   * 查询身体数据历史
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 身体数据记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<BodyRecord[]> => {
    const { startDate, endDate, limit } = options;

    let query = db
      .select()
      .from(bodyRecords)
      .where(eq(bodyRecords.userId, userId))
      .orderBy(desc(bodyRecords.timestamp));

    if (startDate !== undefined) {
      query = query.where(gte(bodyRecords.timestamp, startDate));
    }

    if (endDate !== undefined) {
      query = query.where(lte(bodyRecords.timestamp, endDate));
    }

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query;
  };

  /**
   * 获取用户最新的身体数据记录
   * 用于获取当前体重等信息
   * @param userId 用户ID
   * @returns 最新的一条记录，如果没有则返回 undefined
   */
  const getLatest = async (userId: string): Promise<BodyRecord | undefined> => {
    const results = await db
      .select()
      .from(bodyRecords)
      .where(eq(bodyRecords.userId, userId))
      .orderBy(desc(bodyRecords.timestamp))
      .limit(1);
    return results[0];
  };

  return { record, query, getLatest };
};

/**
 * 身体数据存储模块类型
 */
export type BodyStore = ReturnType<typeof createBodyStore>;
