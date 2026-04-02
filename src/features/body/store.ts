/** 身体数据记录存储模块 - 从 src/store/body.ts 迁移至功能域 */
import type { Db } from '../../store/db';
import { bodyRecords, type BodyRecord } from '../../store/schema';
import { createRecordStore, type QueryOptions } from '../../store/record-store';
import { formatDate } from '../../infrastructure/time';

/**
 * 身体数据记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
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
 * 基于通用 record store，额外提供 getLatest 方法获取最新体重
 * @param db Drizzle ORM 数据库实例
 */
export const createBodyStore = (db: Db) => {
  // 使用通用工厂创建标准 record/query/getLatest 方法
  const store = createRecordStore({
    db,
    table: bodyRecords,
    label: 'body',
    // 字段映射：把 BodyRecordData 转换为 NewBodyRecord 格式
    mapRecord: (userId, data: BodyRecordData, now) => ({
      userId,
      weight: data.weight,
      bodyFat: data.bodyFat,
      bmi: data.bmi,
      note: data.note,
      timestamp: data.timestamp ?? now,
    }),
  });

  return store;
};

/**
 * 身体数据存储模块类型
 */
export type BodyStore = ReturnType<typeof createBodyStore>;

/**
 * 格式化身体数据记录为上下文展示文本
 * @param records 身体数据记录列表
 * @returns 格式化后的文本，无记录时返回 null
 */
export const formatSection = (records: BodyRecord[]): string | null => {
  if (records.length === 0) return null;
  return '### 身体数据\n' + records.map(r =>
    `- ${formatDate(r.timestamp)}: 体重${r.weight ? r.weight + 'kg' : '-'} ${r.bodyFat ? '体脂' + r.bodyFat + '%' : ''} ${r.bmi ? 'BMI ' + r.bmi : ''}`
  ).join('\n');
};
