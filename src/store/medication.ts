import { eq, desc, and, gte, lte, isNull } from 'drizzle-orm';
import type { Db } from './db';
import { medicationRecords, type MedicationRecord, type NewMedicationRecord } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 查询选项接口
 */
export interface MedicationQueryOptions {
  startDate?: number;
  endDate?: number;
  /** 是否只查询正在服用的药物（endDate 为 null） */
  activeOnly?: boolean;
  limit?: number;
}

/**
 * 用药记录数据接口
 */
export interface MedicationRecordData {
  medication: string;
  dosage?: string;
  frequency?: string;
  startDate?: number;
  endDate?: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建用药记录存储模块
 * 提供用药记录的存储和查询功能
 * @param db Drizzle ORM 数据库实例
 */
export const createMedicationStore = (db: Db) => {
  /**
   * 记录用药
   * 创建一条新的用药记录
   * @param userId 用户ID
   * @param data 用药数据（药物名称、剂量、频次等）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: MedicationRecordData): Promise<MedicationRecord> => {
    const now = Date.now();
    const recordData: NewMedicationRecord = {
      userId,
      medication: data.medication,
      dosage: data.dosage,
      frequency: data.frequency,
      startDate: data.startDate,
      endDate: data.endDate,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(medicationRecords).values(recordData).returning();
    logger.info('[store:medication] recorded userId=%s medication=%s dosage=%s', userId, result[0].medication, result[0].dosage);
    return result[0];
  };

  /**
   * 查询用药记录
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、是否只查正在服用、限制数量）
   * @returns 用药记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: MedicationQueryOptions = {}): Promise<MedicationRecord[]> => {
    const { startDate, endDate, activeOnly, limit } = options;

    // 构建过滤条件
    const conditions = [eq(medicationRecords.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(medicationRecords.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(medicationRecords.timestamp, endDate));
    }
    // 只查询正在服用的药物（endDate 为 null）
    if (activeOnly) {
      conditions.push(isNull(medicationRecords.endDate));
    }

    return db
      .select()
      .from(medicationRecords)
      .where(and(...conditions))
      .orderBy(desc(medicationRecords.timestamp))
      .limit(limit ?? 100);
  };

  /**
   * 标记药物停用
   * 设置 endDate 为当前时间，表示已停药
   * @param userId 用户ID
   * @param medicationId 用药记录ID
   * @returns 更新后的记录
   */
  const stop = async (userId: string, medicationId: number): Promise<MedicationRecord> => {
    const now = Date.now();
    const result = await db
      .update(medicationRecords)
      .set({ endDate: now })
      .where(and(eq(medicationRecords.id, medicationId), eq(medicationRecords.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error(`用药记录不存在: ${medicationId}`);
    }

    logger.info('[store:medication] stopped userId=%s medicationId=%d medication=%s', userId, medicationId, result[0].medication);
    return result[0];
  };

  return { record, query, stop };
};

/**
 * 用药记录存储模块类型
 */
export type MedicationStore = ReturnType<typeof createMedicationStore>;
