import type { Db } from './db';
import { healthObservations, type HealthObservation } from './schema';
import { createRecordStore, type QueryOptions } from './record-store';

/**
 * 健康观察记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
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
  // 使用通用工厂创建标准 record/query/getLatest 方法
  const store = createRecordStore({
    db,
    table: healthObservations,
    label: 'observation',
    // 字段映射：把 ObservationRecordData 转换为表插入格式
    // 注意：tags 是 string[] 数组，存储时需序列化为 JSON 字符串
    mapRecord: (userId, data: ObservationRecordData, now) => ({
      userId,
      content: data.content,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      timestamp: data.timestamp ?? now,
    }),
  });

  return store;
};

/**
 * 健康观察记录存储模块类型
 */
export type ObservationStore = ReturnType<typeof createObservationStore>;
