import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { exerciseRecords, type ExerciseRecord, type NewExerciseRecord } from './schema';

/**
 * 查询选项接口
 */
export interface QueryOptions {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * 运动记录数据接口
 */
export interface ExerciseRecordData {
  type: string;
  duration: number;
  calories?: number;
  heartRateAvg?: number;
  heartRateMax?: number;
  distance?: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建运动记录存储模块
 * 提供运动数据（类型、时长、消耗等）的记录和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createExerciseStore = (db: Db) => {
  /**
   * 记录运动
   * 创建一条新的运动记录
   * @param userId 用户ID
   * @param data 运动数据（类型、时长、消耗热量等）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: ExerciseRecordData): Promise<ExerciseRecord> => {
    const now = Date.now();
    const recordData: NewExerciseRecord = {
      userId,
      type: data.type,
      duration: data.duration,
      calories: data.calories,
      heartRateAvg: data.heartRateAvg,
      heartRateMax: data.heartRateMax,
      distance: data.distance,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(exerciseRecords).values(recordData).returning();
    return result[0];
  };

  /**
   * 查询运动记录历史
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 运动记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<ExerciseRecord[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件，将用户ID与时间范围条件合并
    const conditions = [eq(exerciseRecords.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(exerciseRecords.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(exerciseRecords.timestamp, endDate));
    }

    return db
      .select()
      .from(exerciseRecords)
      .where(and(...conditions))
      .orderBy(desc(exerciseRecords.timestamp))
      .limit(limit ?? 100);
  };

  return { record, query };
};

/**
 * 运动记录存储模块类型
 */
export type ExerciseStore = ReturnType<typeof createExerciseStore>;
