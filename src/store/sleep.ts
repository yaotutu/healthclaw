import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { sleepRecords, type SleepRecord, type NewSleepRecord } from './schema';
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
 * 睡眠记录数据接口
 */
export interface SleepRecordData {
  duration: number;
  quality?: number;
  bedTime?: number;
  wakeTime?: number;
  deepSleep?: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建睡眠记录存储模块
 * 提供睡眠数据（时长、质量、深睡时间等）的记录和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createSleepStore = (db: Db) => {
  /**
   * 记录睡眠
   * 创建一条新的睡眠记录
   * @param userId 用户ID
   * @param data 睡眠数据（时长、质量、入睡/醒来时间等）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: SleepRecordData): Promise<SleepRecord> => {
    const now = Date.now();
    const recordData: NewSleepRecord = {
      userId,
      duration: data.duration,
      quality: data.quality,
      bedTime: data.bedTime,
      wakeTime: data.wakeTime,
      deepSleep: data.deepSleep,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(sleepRecords).values(recordData).returning();
    logger.info('[store:sleep] recorded userId=%s duration=%s quality=%s', userId, result[0].duration, result[0].quality);
    return result[0];
  };

  /**
   * 查询睡眠记录历史
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 睡眠记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<SleepRecord[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件，将用户ID与时间范围条件合并
    const conditions = [eq(sleepRecords.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(sleepRecords.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(sleepRecords.timestamp, endDate));
    }

    return db
      .select()
      .from(sleepRecords)
      .where(and(...conditions))
      .orderBy(desc(sleepRecords.timestamp))
      .limit(limit ?? 100);
  };

  return { record, query };
};

/**
 * 睡眠记录存储模块类型
 */
export type SleepStore = ReturnType<typeof createSleepStore>;
