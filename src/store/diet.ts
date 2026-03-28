import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from './db';
import { dietRecords, type DietRecord, type NewDietRecord } from './schema';

/**
 * 查询选项接口
 */
export interface QueryOptions {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * 饮食记录数据接口
 */
export interface DietRecordData {
  food: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  sodium?: number;
  mealType?: string;
  note?: string;
  timestamp?: number;
}

/**
 * 创建饮食记录存储模块
 * 提供饮食摄入记录和营养数据的存储和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createDietStore = (db: Db) => {
  /**
   * 记录饮食
   * 创建一条新的饮食摄入记录
   * @param userId 用户ID
   * @param data 饮食数据（食物名称、热量、营养成分等）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: DietRecordData): Promise<DietRecord> => {
    const now = Date.now();
    const recordData: NewDietRecord = {
      userId,
      food: data.food,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      sodium: data.sodium,
      mealType: data.mealType,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(dietRecords).values(recordData).returning();
    return result[0];
  };

  /**
   * 查询饮食记录历史
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 饮食记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<DietRecord[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件，将用户ID与时间范围条件合并
    const conditions = [eq(dietRecords.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(dietRecords.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(dietRecords.timestamp, endDate));
    }

    return db
      .select()
      .from(dietRecords)
      .where(and(...conditions))
      .orderBy(desc(dietRecords.timestamp))
      .limit(limit ?? 100);
  };

  return { record, query };
};

/**
 * 饮食记录存储模块类型
 */
export type DietStore = ReturnType<typeof createDietStore>;
