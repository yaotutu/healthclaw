import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from './db';
import { logger } from '../infrastructure/logger';

/**
 * 标准健康记录表的通用查询选项
 * 所有标准记录表（body、diet、exercise、sleep、water、observation）共享此接口
 */
export interface QueryOptions {
  /** 起始时间戳（毫秒） */
  startDate?: number;
  /** 结束时间戳（毫秒） */
  endDate?: number;
  /** 返回数量限制，默认 100 */
  limit?: number;
}

/**
 * 创建标准健康记录存储模块的工厂函数
 *
 * 提取了 body/diet/exercise/sleep/water/observation 六个 store 共用的 record/query/getLatest 逻辑。
 * 每种记录类型只需声明自己独有的字段映射，公共的插入和查询逻辑由本函数提供。
 *
 * 约定：传入的 table 必须有 userId (text) 和 timestamp (integer) 两个列。
 *
 * @param config.db Drizzle ORM 数据库实例
 * @param config.table Drizzle 表定义（如 bodyRecords、dietRecords）
 * @param config.label 日志标签，如 'body'、'diet'
 * @param config.mapRecord 字段映射函数，把业务数据转换为表插入数据
 * @returns 包含 record/query/getLatest 方法的存储对象
 */
export function createRecordStore<TRecord = any, TNewRecord = any>(config: {
  db: Db;
  /** Drizzle 表定义，必须有 userId 和 timestamp 列 */
  table: SQLiteTable;
  /** 日志标签，用于日志输出，如 'body'、'diet' */
  label: string;
  /**
   * 把业务数据转换为表插入数据
   * 负责把用户传入的参数映射为 Drizzle 插入格式，并设置默认的 timestamp
   * @param userId 用户 ID
   * @param data 业务数据
   * @param now 当前时间戳，用作默认的 timestamp
   * @returns 可直接用于 db.insert().values() 的数据对象
   */
  mapRecord: (userId: string, data: any, now: number) => TNewRecord;
}) {
  const { db, table, label, mapRecord } = config;

  // 获取表的 userId 和 timestamp 列引用，用于通用查询条件构建
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = table as any;

  /**
   * 插入一条记录
   * 使用 mapRecord 将业务数据转换为表格式，插入后记录日志
   * @param userId 用户 ID
   * @param data 业务数据（各类型不同）
   * @returns 插入成功的完整记录
   */
  const record = async (userId: string, data: any): Promise<TRecord> => {
    const now = Date.now();
    const recordData = mapRecord(userId, data, now);
    const result = await db.insert(table).values(recordData as any).returning();
    logger.info(`[store:${label}] recorded userId=%s`, userId);
    return result[0] as TRecord;
  };

  /**
   * 按时间范围查询记录
   * 默认按 timestamp 倒序排列，最多返回 100 条
   * @param userId 用户 ID
   * @param options 查询选项（时间范围、数量限制）
   * @returns 记录列表
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<TRecord[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件：用户 ID + 可选的时间范围
    const conditions = [eq(columns.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(columns.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(columns.timestamp, endDate));
    }

    return db
      .select()
      .from(table)
      .where(and(...conditions))
      .orderBy(desc(columns.timestamp))
      .limit(limit ?? 100) as Promise<TRecord[]>;
  };

  /**
   * 获取最新一条记录
   * 按 timestamp 倒序取第一条，常用于获取当前体重等最新数据
   * @param userId 用户 ID
   * @returns 最新的一条记录，如果没有则返回 undefined
   */
  const getLatest = async (userId: string): Promise<TRecord | undefined> => {
    const results = await db
      .select()
      .from(table)
      .where(eq(columns.userId, userId))
      .orderBy(desc(columns.timestamp))
      .limit(1);
    return results[0] as TRecord | undefined;
  };

  return { record, query, getLatest };
}
