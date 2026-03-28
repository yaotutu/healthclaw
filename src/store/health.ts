import { eq, desc, gte, and, sql } from 'drizzle-orm';
import type { Db } from './db';
import { healthRecords, type HealthRecord, type NewHealthRecord } from './schema';

/** 查询选项接口，用于筛选健康记录 */
export interface QueryOptions {
  userId: string;
  type?: 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';
  days?: number;
  limit?: number;
}

/** 每日营养汇总行类型，包含日期、餐次数及各营养素总量 */
interface DailySummaryRow {
  date: string;
  meals: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** 食物频次统计行类型，包含食物名称和出现次数 */
interface FoodFrequencyRow {
  food: string;
  count: number;
}

/** 饮食分析结果类型，包含统计天数、每日汇总和食物频次 */
interface AnalyzeResult {
  days: number;
  dailySummary: DailySummaryRow[];
  foodFrequency: FoodFrequencyRow[];
}

/**
 * 创建健康数据存储实例
 * 提供健康记录的增删查改和饮食数据分析功能
 * @param db Drizzle ORM 数据库实例
 */
export const createHealthStore = (db: Db) => {
  /**
   * 记录一条健康数据
   * 自动填充当前时间戳，插入数据库并返回完整记录
   * @param data 健康记录数据（不含 id 和 timestamp）
   * @returns 新创建的健康记录
   */
  const record = async (data: Omit<NewHealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord> => {
    const result = await db.insert(healthRecords)
      .values({ ...data, timestamp: Date.now() })
      .returning();
    return result[0];
  };

  /**
   * 查询健康记录
   * 支持按用户、类型、时间范围筛选，按时间倒序排列
   * @param options 查询选项，包含筛选条件
   * @returns 符合条件的健康记录数组
   */
  const query = async (options: QueryOptions): Promise<HealthRecord[]> => {
    const conditions = [eq(healthRecords.userId, options.userId)];

    if (options.type) {
      conditions.push(eq(healthRecords.type, options.type));
    }

    if (options.days) {
      const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;
      conditions.push(gte(healthRecords.timestamp, cutoff));
    }

    const limit = options.limit ?? 10;

    return db.select()
      .from(healthRecords)
      .where(and(...conditions))
      .orderBy(desc(healthRecords.timestamp))
      .limit(limit);
  };

  /**
   * 饮食数据分析方法
   * 按日期聚合饮食数据，统计每日营养摄入和食物频次
   * 使用 SQLite json_extract() 从 detail JSON 字段提取营养数据
   *
   * 注意：db.all() 是同步方法（bun-sqlite 驱动特性），直接返回结果数组
   *
   * @param userId 用户ID
   * @param days 统计天数，默认 7 天
   * @returns 包含每日汇总和食物频次的分析结果
   */
  const analyze = (userId: string, days: number = 7): AnalyzeResult => {
    // 计算截止时间戳（毫秒），只统计最近 N 天的数据
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // 按日期聚合每日营养摄入统计
    // 使用 json_extract 从 detail JSON 中提取 calories、protein、carbs、fat 字段
    // COALESCE 处理缺失值，确保聚合计算正确
    const dailySummary = db.all<DailySummaryRow>(sql`
      SELECT
        DATE(${healthRecords.timestamp} / 1000, 'unixepoch') as date,
        COUNT(*) as meals,
        SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.calories'), 0) AS REAL)) as calories,
        SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.protein'), 0) AS REAL)) as protein,
        SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.carbs'), 0) AS REAL)) as carbs,
        SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.fat'), 0) AS REAL)) as fat
      FROM ${healthRecords}
      WHERE ${healthRecords.userId} = ${userId}
        AND ${healthRecords.type} = 'diet'
        AND ${healthRecords.timestamp} >= ${cutoff}
        AND ${healthRecords.detail} IS NOT NULL
      GROUP BY DATE(${healthRecords.timestamp} / 1000, 'unixepoch')
      ORDER BY date DESC
    `);

    // 食物频次统计，提取 detail 中的 food 字段并按出现次数排序
    // 限制返回前 20 个最常吃的食物
    const foodFrequency = db.all<FoodFrequencyRow>(sql`
      SELECT
        json_extract(${healthRecords.detail}, '$.food') as food,
        COUNT(*) as count
      FROM ${healthRecords}
      WHERE ${healthRecords.userId} = ${userId}
        AND ${healthRecords.type} = 'diet'
        AND ${healthRecords.timestamp} >= ${cutoff}
        AND ${healthRecords.detail} IS NOT NULL
      GROUP BY json_extract(${healthRecords.detail}, '$.food')
      ORDER BY count DESC
      LIMIT 20
    `);

    return {
      days,
      dailySummary,
      foodFrequency,
    };
  };

  return { record, query, analyze };
};

/** 健康数据存储实例类型，包含 record、query、analyze 三个方法 */
export type HealthStore = ReturnType<typeof createHealthStore>;
