/**
 * 症状记录存储模块 - 从 src/store/symptom.ts 迁移至功能域
 *
 * 症状记录使用自定义实现（不使用 createRecordStore），
 * 因为它包含独特的 resolve（标记已解决）功能，
 * 且需要支持关联其他记录类型的能力。
 */
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import type { Db } from '../../store/db';
import { symptomRecords, type SymptomRecord, type NewSymptomRecord } from '../../store/schema';
import { logger } from '../../infrastructure/logger';
import { formatDate } from '../../infrastructure/time';

/**
 * 查询选项接口
 */
export interface QueryOptions {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * 症状记录数据接口
 */
export interface SymptomRecordData {
  description: string;
  severity?: number;
  bodyPart?: string;
  relatedType?: string;
  relatedId?: number;
  resolvedAt?: number;
  note?: string;
  timestamp?: number;
}

/**
 * 创建症状记录存储模块
 * 提供身体不适、症状的记录和查询功能
 * 支持关联其他记录类型（如饮食、运动），帮助追踪症状诱因
 * @param db Drizzle ORM 数据库实例
 */
export const createSymptomStore = (db: Db) => {
  /**
   * 记录症状
   * 创建一条新的症状/不适记录
   * 可用于关联其他记录类型，追踪可能的诱因
   * @param userId 用户ID
   * @param data 症状数据（描述、严重程度、身体部位等）
   * @returns 创建成功的记录
   */
  const record = async (userId: string, data: SymptomRecordData): Promise<SymptomRecord> => {
    const now = Date.now();
    const recordData: NewSymptomRecord = {
      userId,
      description: data.description,
      severity: data.severity,
      bodyPart: data.bodyPart,
      relatedType: data.relatedType,
      relatedId: data.relatedId,
      resolvedAt: data.resolvedAt,
      note: data.note,
      timestamp: data.timestamp ?? now,
    };

    const result = await db.insert(symptomRecords).values(recordData).returning();
    logger.info('[store:symptom] recorded userId=%s description=%s severity=%s bodyPart=%s', userId, result[0].description, result[0].severity, result[0].bodyPart);
    return result[0];
  };

  /**
   * 查询症状记录历史
   * 支持按时间范围筛选和限制返回数量
   * @param userId 用户ID
   * @param options 查询选项（时间范围、限制数量）
   * @returns 症状记录列表，按时间倒序排列
   */
  const query = async (userId: string, options: QueryOptions = {}): Promise<SymptomRecord[]> => {
    const { startDate, endDate, limit } = options;

    // 构建过滤条件，将用户ID与时间范围条件合并
    const conditions = [eq(symptomRecords.userId, userId)];
    if (startDate !== undefined) {
      conditions.push(gte(symptomRecords.timestamp, startDate));
    }
    if (endDate !== undefined) {
      conditions.push(lte(symptomRecords.timestamp, endDate));
    }

    return db
      .select()
      .from(symptomRecords)
      .where(and(...conditions))
      .orderBy(desc(symptomRecords.timestamp))
      .limit(limit ?? 100);
  };

  /**
   * 标记症状为已解决
   * 更新症状的 resolved_at 字段为当前时间
   * @param userId 用户ID
   * @param symptomId 症状记录ID
   * @returns 更新后的记录
   */
  const resolve = async (userId: string, symptomId: number): Promise<SymptomRecord> => {
    const now = Date.now();
    const result = await db
      .update(symptomRecords)
      .set({ resolvedAt: now })
      .where(and(eq(symptomRecords.id, symptomId), eq(symptomRecords.userId, userId)))
      .returning();
    logger.info('[store:symptom] resolved userId=%s symptomId=%d', userId, symptomId);
    return result[0];
  };

  return { record, query, resolve };
};

/**
 * 症状记录存储模块类型
 */
export type SymptomStore = ReturnType<typeof createSymptomStore>;

/**
 * 格式化症状记录为上下文展示文本
 * @param records 症状记录列表
 * @returns 格式化后的文本，无记录时返回 null
 */
export const formatSection = (records: SymptomRecord[]): string | null => {
  if (records.length === 0) return null;
  return '### 症状记录\n' + records.map(r =>
    `- ${formatDate(r.timestamp)}: ${r.description}${r.severity ? ' 严重程度' + r.severity + '/10' : ''}${r.bodyPart ? ' (' + r.bodyPart + ')' : ''}${r.resolvedAt ? ' [已解决]' : ''}`
  ).join('\n');
};
