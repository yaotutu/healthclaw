import type { Db } from './db';
import { dietRecords, type DietRecord } from './schema';
import { createRecordStore, type QueryOptions } from './record-store';

/**
 * 饮食记录的数据接口
 * 用于工具层传入数据，不含 userId 和 id
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
  // 使用通用工厂创建标准 record/query/getLatest 方法
  const store = createRecordStore({
    db,
    table: dietRecords,
    label: 'diet',
    // 字段映射：把 DietRecordData 转换为表插入格式
    mapRecord: (userId, data: DietRecordData, now) => ({
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
    }),
  });

  return store;
};

/**
 * 饮食记录存储模块类型
 */
export type DietStore = ReturnType<typeof createDietStore>;
