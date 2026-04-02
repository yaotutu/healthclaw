/** 饮水记录存储模块 - 从 src/store/water.ts 迁移至功能域 */
import type { Db } from '../../store/db';
import { waterRecords, type WaterRecord } from '../../store/schema';
import { createRecordStore, type QueryOptions } from '../../store/record-store';
import { formatDate } from '../../infrastructure/time';

/**
 * 饮水记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
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
  // 使用通用工厂创建标准 record/query/getLatest 方法
  const store = createRecordStore({
    db,
    table: waterRecords,
    label: 'water',
    // 字段映射：把 WaterRecordData 转换为表插入格式
    mapRecord: (userId, data: WaterRecordData, now) => ({
      userId,
      amount: data.amount,
      note: data.note,
      timestamp: data.timestamp ?? now,
    }),
  });

  return store;
};

/**
 * 饮水记录存储模块类型
 */
export type WaterStore = ReturnType<typeof createWaterStore>;

/**
 * 格式化饮水记录为上下文展示文本
 * @param records 饮水记录列表
 * @returns 格式化后的文本，无记录时返回 null
 */
export const formatSection = (records: WaterRecord[]): string | null => {
  if (records.length === 0) return null;
  return '### 饮水记录\n' + records.map(r =>
    `- ${formatDate(r.timestamp)}: ${r.amount}ml`
  ).join('\n');
};
