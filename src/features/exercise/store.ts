/** 运动记录存储模块 - 从 src/store/exercise.ts 迁移至功能域 */
import type { Db } from '../../store/db';
import { exerciseRecords, type ExerciseRecord } from '../../store/schema';
import { createRecordStore, type QueryOptions } from '../../store/record-store';
import { formatDate } from '../../infrastructure/time';

/**
 * 运动记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
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
  // 使用通用工厂创建标准 record/query/getLatest 方法
  const store = createRecordStore({
    db,
    table: exerciseRecords,
    label: 'exercise',
    // 字段映射：把 ExerciseRecordData 转换为表插入格式
    mapRecord: (userId, data: ExerciseRecordData, now) => ({
      userId,
      type: data.type,
      duration: data.duration,
      calories: data.calories,
      heartRateAvg: data.heartRateAvg,
      heartRateMax: data.heartRateMax,
      distance: data.distance,
      note: data.note,
      timestamp: data.timestamp ?? now,
    }),
  });

  return store;
};

/**
 * 运动记录存储模块类型
 */
export type ExerciseStore = ReturnType<typeof createExerciseStore>;

/**
 * 格式化运动记录为上下文展示文本
 * @param records 运动记录列表
 * @returns 格式化后的文本，无记录时返回 null
 */
export const formatSection = (records: ExerciseRecord[]): string | null => {
  if (records.length === 0) return null;
  return '### 运动记录\n' + records.map(r =>
    `- ${formatDate(r.timestamp)}: ${r.type} ${r.duration ? r.duration + '分钟' : ''} ${r.calories ? '消耗' + r.calories + 'kcal' : ''}`
  ).join('\n');
};
