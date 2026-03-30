/** 睡眠记录存储模块 - 从 src/store/sleep.ts 迁移至功能域 */
import type { Db } from '../../store/db';
import { sleepRecords, type SleepRecord } from '../../store/schema';
import { createRecordStore, type QueryOptions } from '../../store/record-store';

/**
 * 睡眠记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
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
  // 使用通用工厂创建标准 record/query/getLatest 方法
  const store = createRecordStore({
    db,
    table: sleepRecords,
    label: 'sleep',
    // 字段映射：把 SleepRecordData 转换为表插入格式
    mapRecord: (userId, data: SleepRecordData, now) => ({
      userId,
      duration: data.duration,
      quality: data.quality,
      bedTime: data.bedTime,
      wakeTime: data.wakeTime,
      deepSleep: data.deepSleep,
      note: data.note,
      timestamp: data.timestamp ?? now,
    }),
  });

  return store;
};

/**
 * 睡眠记录存储模块类型
 */
export type SleepStore = ReturnType<typeof createSleepStore>;
