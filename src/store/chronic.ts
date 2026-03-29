import { eq, desc, and, isNull } from 'drizzle-orm';
import type { Db } from './db';
import { chronicConditions, type ChronicCondition, type NewChronicCondition } from './schema';
import { logger } from '../infrastructure/logger';

/**
 * 慢性病记录数据接口
 */
export interface ChronicConditionData {
  condition: string;
  severity?: string;
  seasonalPattern?: string;
  triggers?: string[];
  notes?: string;
}

/**
 * 慢性病更新数据接口
 */
export interface ChronicConditionUpdate {
  severity?: string;
  seasonalPattern?: string;
  triggers?: string[];
  notes?: string;
}

/**
 * 创建慢性病记录存储模块
 * 提供慢性病的增删改查功能
 * @param db Drizzle ORM 数据库实例
 */
export const createChronicStore = (db: Db) => {
  /**
   * 添加慢性病记录
   * 创建一条新的慢性病追踪记录
   * @param userId 用户ID
   * @param data 慢性病数据（病名、严重程度、季节模式、触发因素等）
   * @returns 创建成功的记录
   */
  const add = async (userId: string, data: ChronicConditionData): Promise<ChronicCondition> => {
    const now = Date.now();
    const recordData: NewChronicCondition = {
      userId,
      condition: data.condition,
      severity: data.severity,
      seasonalPattern: data.seasonalPattern,
      triggers: data.triggers ? JSON.stringify(data.triggers) : null,
      notes: data.notes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.insert(chronicConditions).values(recordData).returning();
    logger.info('[store:chronic] added userId=%s condition=%s severity=%s', userId, result[0].condition, result[0].severity);
    return result[0];
  };

  /**
   * 更新慢性病记录
   * 更新指定慢性病的信息（严重程度、触发因素等）
   * @param userId 用户ID
   * @param conditionId 慢性病记录ID
   * @param data 更新数据
   * @returns 更新后的记录
   */
  const update = async (userId: string, conditionId: number, data: ChronicConditionUpdate): Promise<ChronicCondition> => {
    const updateData: Partial<NewChronicCondition> = {
      updatedAt: Date.now(),
    };

    if (data.severity !== undefined) updateData.severity = data.severity;
    if (data.seasonalPattern !== undefined) updateData.seasonalPattern = data.seasonalPattern;
    if (data.triggers !== undefined) updateData.triggers = JSON.stringify(data.triggers);
    if (data.notes !== undefined) updateData.notes = data.notes;

    const result = await db
      .update(chronicConditions)
      .set(updateData)
      .where(and(eq(chronicConditions.id, conditionId), eq(chronicConditions.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error(`慢性病记录不存在: ${conditionId}`);
    }

    logger.info('[store:chronic] updated userId=%s conditionId=%d', userId, conditionId);
    return result[0];
  };

  /**
   * 查询慢性病记录
   * 默认只查询活跃的慢性病（isActive=true）
   * @param userId 用户ID
   * @param options 查询选项
   * @returns 慢性病记录列表
   */
  const query = async (userId: string, options: { activeOnly?: boolean } = {}): Promise<ChronicCondition[]> => {
    const conditions = [eq(chronicConditions.userId, userId)];
    if (options.activeOnly !== false) {
      conditions.push(eq(chronicConditions.isActive, true));
    }

    return db
      .select()
      .from(chronicConditions)
      .where(and(...conditions))
      .orderBy(desc(chronicConditions.updatedAt));
  };

  /**
   * 停用慢性病追踪
   * 将 isActive 设为 false，表示不再追踪该慢性病
   * @param userId 用户ID
   * @param conditionId 慢性病记录ID
   * @returns 更新后的记录
   */
  const deactivate = async (userId: string, conditionId: number): Promise<ChronicCondition> => {
    const result = await db
      .update(chronicConditions)
      .set({ isActive: false, updatedAt: Date.now() })
      .where(and(eq(chronicConditions.id, conditionId), eq(chronicConditions.userId, userId)))
      .returning();

    if (result.length === 0) {
      throw new Error(`慢性病记录不存在: ${conditionId}`);
    }

    logger.info('[store:chronic] deactivated userId=%s conditionId=%d condition=%s', userId, conditionId, result[0].condition);
    return result[0];
  };

  return { add, update, query, deactivate };
};

/**
 * 慢性病记录存储模块类型
 */
export type ChronicStore = ReturnType<typeof createChronicStore>;
